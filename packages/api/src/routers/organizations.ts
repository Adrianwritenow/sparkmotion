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
      select: {
        id: true,
        name: true,
        slug: true,
        websiteUrl: true,
        contactEmail: true,
        _count: { select: { events: true } },
      },
      orderBy: { name: "asc" },
    });
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return db.organization.findUniqueOrThrow({
        where: { id: input.id },
        include: { _count: { select: { events: true, users: true } } },
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
    .mutation(async ({ input }) => {
      await db.organization.delete({ where: { id: input.id } });
      return { success: true };
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
        where: { id: input.orgId },
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
