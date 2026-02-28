import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { db } from "@sparkmotion/database";
import { sendContactEmail } from "@sparkmotion/email";

export const organizationsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "ADMIN") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    return db.organization.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        websiteUrl: true,
        contactEmail: true,
        _count: { select: { events: { where: { deletedAt: null } } } },
      },
      orderBy: { name: "asc" },
    });
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return db.organization.findUniqueOrThrow({
        where: { id: input.id, deletedAt: null },
        include: { _count: { select: { events: { where: { deletedAt: null } }, users: true } } },
      });
    }),

  listMembers: adminProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input }) => {
      return db.user.findMany({
        where: { orgId: input.orgId },
        select: { id: true, name: true, email: true, orgRole: true },
        orderBy: { name: "asc" },
      });
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      slug: z.string().min(1).optional(),
      websiteUrl: z.string().url().optional(),
      contactEmail: z.string().email(),
    }))
    .mutation(async ({ input }) => {
      const slug = (input.slug ?? input.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      try {
        return await db.organization.create({
          data: {
            name: input.name,
            slug,
            websiteUrl: input.websiteUrl,
            contactEmail: input.contactEmail,
          },
          select: { id: true, name: true, slug: true, websiteUrl: true },
        });
      } catch (error: any) {
        if (error?.code === "P2002") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Slug taken, please pick another.",
          });
        }
        throw error;
      }
    }),

  checkSlug: adminProcedure
    .input(z.object({ slug: z.string(), excludeOrgId: z.string().optional() }))
    .query(async ({ input }) => {
      const normalized = input.slug
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      if (!normalized) return { available: false, slug: normalized };

      const existing = await db.organization.findUnique({
        where: { slug: normalized },
        select: { id: true },
      });

      const available = !existing || existing.id === input.excludeOrgId;
      return { available, slug: normalized };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      slug: z.string().min(1).optional(),
      websiteUrl: z.string().url().nullable().optional(),
      contactEmail: z.string().email().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updateData: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) updateData[key] = value;
      }
      if (updateData.slug) {
        updateData.slug = updateData.slug
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      }
      try {
        return await db.organization.update({ where: { id }, data: updateData });
      } catch (error: any) {
        if (error?.code === "P2002") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Slug taken, please pick another.",
          });
        }
        throw error;
      }
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      await db.$transaction([
        db.organization.update({
          where: { id: input.id },
          data: { deletedAt: now, deletedBy: ctx.user.id },
        }),
        db.event.updateMany({
          where: { orgId: input.id, deletedAt: null },
          data: { deletedAt: now, deletedBy: ctx.user.id },
        }),
        db.campaign.updateMany({
          where: { orgId: input.id, deletedAt: null },
          data: { deletedAt: now, deletedBy: ctx.user.id },
        }),
        db.band.updateMany({
          where: { event: { orgId: input.id }, deletedAt: null },
          data: { deletedAt: now, deletedBy: ctx.user.id },
        }),
      ]);
      return { success: true };
    }),

  trashCount: adminProcedure.query(async () => {
    return db.organization.count({ where: { deletedAt: { not: null } } });
  }),

  listDeleted: adminProcedure.query(async () => {
    const orgs = await db.organization.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        deletedBy: true,
      },
      orderBy: { deletedAt: "desc" },
    });
    // Resolve deletedBy to user name/email
    const userIds = orgs.map((o) => o.deletedBy).filter((id): id is string => !!id);
    const users = userIds.length > 0
      ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.name || u.email]));
    return orgs.map((o) => ({
      ...o,
      deletedByName: o.deletedBy ? userMap.get(o.deletedBy) ?? null : null,
    }));
  }),

  restore: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const org = await db.organization.findUniqueOrThrow({
        where: { id: input.id },
      });
      if (!org.deletedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Organization is not deleted" });
      }
      await db.$transaction([
        db.organization.update({
          where: { id: input.id },
          data: { deletedAt: null, deletedBy: null },
        }),
        // Restore cascade-deleted children (deleted at same time or after org)
        db.event.updateMany({
          where: { orgId: input.id, deletedAt: { gte: org.deletedAt } },
          data: { deletedAt: null, deletedBy: null },
        }),
        db.campaign.updateMany({
          where: { orgId: input.id, deletedAt: { gte: org.deletedAt } },
          data: { deletedAt: null, deletedBy: null },
        }),
        db.band.updateMany({
          where: { event: { orgId: input.id }, deletedAt: { gte: org.deletedAt } },
          data: { deletedAt: null, deletedBy: null },
        }),
      ]);
      return { success: true };
    }),

  restoreAll: adminProcedure.mutation(async () => {
    const deletedOrgs = await db.organization.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, deletedAt: true },
    });
    if (deletedOrgs.length === 0) return { restored: 0 };

    await db.$transaction(async (tx) => {
      for (const org of deletedOrgs) {
        await tx.organization.update({
          where: { id: org.id },
          data: { deletedAt: null, deletedBy: null },
        });
        // Restore cascade-deleted children (deleted at same time or after org)
        await tx.event.updateMany({
          where: { orgId: org.id, deletedAt: { gte: org.deletedAt! } },
          data: { deletedAt: null, deletedBy: null },
        });
        await tx.campaign.updateMany({
          where: { orgId: org.id, deletedAt: { gte: org.deletedAt! } },
          data: { deletedAt: null, deletedBy: null },
        });
        await tx.band.updateMany({
          where: { event: { orgId: org.id }, deletedAt: { gte: org.deletedAt! } },
          data: { deletedAt: null, deletedBy: null },
        });
      }
    });
    return { restored: deletedOrgs.length };
  }),

  updateName: protectedProcedure
    .input(z.object({
      orgId: z.string(),
      name: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role === "CUSTOMER" && ctx.user.orgId !== input.orgId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return db.organization.update({
        where: { id: input.orgId },
        data: { name: input.name },
      });
    }),

  updateWebsiteUrl: protectedProcedure
    .input(z.object({
      orgId: z.string(),
      websiteUrl: z.string().url().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Customer can only update their own org
      if (ctx.user.role === "CUSTOMER" && ctx.user.orgId !== input.orgId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return db.organization.update({
        where: { id: input.orgId },
        data: { websiteUrl: input.websiteUrl },
      });
    }),

  addMember: adminProcedure
    .input(
      z.object({
        orgId: z.string(),
        name: z.string().min(1),
        email: z.string().email(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await db.user.upsert({
          where: { email: input.email },
          create: {
            email: input.email,
            name: input.name,
            role: "CUSTOMER",
            orgId: input.orgId,
            orgRole: "VIEWER",
          },
          update: { orgId: input.orgId },
          select: { id: true, name: true, email: true, orgRole: true },
        });
      } catch (error: any) {
        if (error?.code === "P2002") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This user is already a member of this organization.",
          });
        }
        throw error;
      }
    }),

  sendContactEmail: adminProcedure
    .input(z.object({
      orgId: z.string(),
      to: z.string().email(),
      subject: z.string().min(1),
      body: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const org = await db.organization.findUnique({
        where: { id: input.orgId, deletedAt: null },
        select: { name: true },
      });
      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      await sendContactEmail({
        to: input.to,
        subject: input.subject,
        body: input.body,
        orgName: org.name,
        senderName: ctx.user.name || ctx.user.email,
      });

      return { success: true };
    }),
});
