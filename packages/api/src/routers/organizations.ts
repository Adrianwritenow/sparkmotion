import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { db, Prisma } from "@sparkmotion/database";

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
      websiteUrl: z.string().url().optional(),
    }))
    .mutation(async ({ input }) => {
      const slug = input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      try {
        return await db.organization.create({
          data: {
            name: input.name,
            slug,
            websiteUrl: input.websiteUrl,
          },
          select: { id: true, name: true, slug: true, websiteUrl: true },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "An organization with this name already exists. Please choose a different name.",
          });
        }
        throw error;
      }
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      websiteUrl: z.string().url().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updateData: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) updateData[key] = value;
      }
      return db.organization.update({ where: { id }, data: updateData });
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
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This user is already a member of this organization.",
          });
        }
        throw error;
      }
    }),
});
