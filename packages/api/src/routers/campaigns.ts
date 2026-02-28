import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { db, Prisma } from "@sparkmotion/database";
import { getEventEngagement } from "../lib/engagement";

export const campaignsRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const where =
        ctx.user.role === "ADMIN"
          ? input?.orgId ? { orgId: input.orgId, deletedAt: null } : { deletedAt: null }
          : { orgId: ctx.user.orgId!, deletedAt: null };
      const campaigns = await db.campaign.findMany({
        where,
        include: {
          org: true,
          events: {
            where: { deletedAt: null },
            select: { id: true, location: true, _count: { select: { bands: { where: { deletedAt: null } } } } },
          },
          _count: { select: { events: { where: { deletedAt: null } } } },
        },
        orderBy: { createdAt: "desc" },
      });

      // Add aggregate engagement data from DB
      const allEventIds = campaigns.flatMap((c) => c.events.map((e) => e.id));
      const bandCountByEvent = new Map(
        campaigns.flatMap((c) => c.events.map((e) => [e.id, e._count.bands] as const))
      );
      const engagementMap = await getEventEngagement(allEventIds, bandCountByEvent);

      return campaigns.map((campaign) => {
        let totalPairs = 0;
        let totalDenominator = 0;
        let totalBands = 0;
        for (const event of campaign.events) {
          const eng = engagementMap.get(event.id);
          totalBands += event._count.bands;
          if (eng) {
            totalPairs += eng.engagedPairs;
            totalDenominator += event._count.bands * eng.elapsedWindows;
          }
        }
        const aggregateEngagement = totalDenominator > 0
          ? Math.round((totalPairs / totalDenominator) * 100)
          : 0;
        const locations = campaign.events
          .map((e) => e.location)
          .filter((loc): loc is string => !!loc);
        return {
          ...campaign,
          aggregateEngagement,
          totalBands,
          locations,
        };
      });
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const campaign = await db.campaign.findUniqueOrThrow({
        where: { id: input.id, deletedAt: null },
        include: {
          org: true,
          events: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            select: { id: true, location: true, _count: { select: { bands: { where: { deletedAt: null } } } } },
          },
          _count: { select: { events: { where: { deletedAt: null } } } },
        },
      });

      // Add aggregate engagement data from DB
      const eventIds = campaign.events.map((e) => e.id);
      const bandCountByEvent = new Map(
        campaign.events.map((e) => [e.id, e._count.bands] as const)
      );
      const engagementMap = await getEventEngagement(eventIds, bandCountByEvent);

      let totalPairs = 0;
      let totalDenominator = 0;
      let totalBands = 0;
      for (const event of campaign.events) {
        const eng = engagementMap.get(event.id);
        totalBands += event._count.bands;
        if (eng) {
          totalPairs += eng.engagedPairs;
          totalDenominator += event._count.bands * eng.elapsedWindows;
        }
      }
      const aggregateEngagement = totalDenominator > 0
        ? Math.round((totalPairs / totalDenominator) * 100)
        : 0;
      const locations = campaign.events
        .map((e) => e.location)
        .filter((loc): loc is string => !!loc);

      return {
        ...campaign,
        aggregateEngagement,
        totalBands,
        locations,
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        orgId: z.string(),
        name: z.string().min(1),
        status: z.enum(["DRAFT", "ACTIVE", "COMPLETED"]).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        eventIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Role-based orgId enforcement
      const orgId = ctx.user.role === "CUSTOMER" ? ctx.user.orgId! : input.orgId;

      const { eventIds, ...campaignData } = input;

      // Use transaction to create campaign and associate events
      return db.$transaction(async (tx) => {
        const campaign = await tx.campaign.create({
          data: { ...campaignData, orgId },
        });

        // Associate events with the campaign if eventIds provided
        if (eventIds && eventIds.length > 0) {
          await tx.event.updateMany({
            where: { id: { in: eventIds } },
            data: { campaignId: campaign.id },
          });
        }

        return campaign;
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        status: z.enum(["DRAFT", "ACTIVE", "COMPLETED"]).optional(),
        startDate: z.date().nullable().optional(),
        endDate: z.date().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      // Check ownership for CUSTOMER role
      if (ctx.user.role === "CUSTOMER") {
        const campaign = await db.campaign.findUniqueOrThrow({
          where: { id, deletedAt: null },
          select: { orgId: true },
        });
        if (campaign.orgId !== ctx.user.orgId) {
          throw new Error("Forbidden: You can only update campaigns in your organization");
        }
      }

      return db.campaign.update({ where: { id }, data });
    }),

  availableEvents: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ input }) => {
      const campaign = await db.campaign.findUniqueOrThrow({
        where: { id: input.campaignId, deletedAt: null },
        select: { orgId: true },
      });
      return db.event.findMany({
        where: { orgId: campaign.orgId, campaignId: null, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    }),

  addEvents: protectedProcedure
    .input(
      z.object({
        campaignId: z.string(),
        eventIds: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ input }) => {
      await db.event.updateMany({
        where: { id: { in: input.eventIds } },
        data: { campaignId: input.campaignId },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check ownership for CUSTOMER role
      if (ctx.user.role === "CUSTOMER") {
        const campaign = await db.campaign.findUniqueOrThrow({
          where: { id: input.id, deletedAt: null },
          select: { orgId: true },
        });
        if (campaign.orgId !== ctx.user.orgId) {
          throw new Error("Forbidden: You can only delete campaigns in your organization");
        }
      }

      const now = new Date();
      await db.$transaction([
        db.campaign.update({
          where: { id: input.id },
          data: { deletedAt: now, deletedBy: ctx.user.id },
        }),
        db.event.updateMany({
          where: { campaignId: input.id, deletedAt: null },
          data: { deletedCampaignId: input.id, campaignId: null },
        }),
      ]);
    }),

  trashCount: protectedProcedure.query(async ({ ctx }) => {
    const where = ctx.user.role === "ADMIN"
      ? { deletedAt: { not: null } as const }
      : { orgId: ctx.user.orgId!, deletedAt: { not: null } as const };
    return db.campaign.count({ where });
  }),

  listDeleted: protectedProcedure
    .input(z.object({ orgId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const where = ctx.user.role === "ADMIN"
        ? { ...(input?.orgId ? { orgId: input.orgId } : {}), deletedAt: { not: null } as const }
        : { orgId: ctx.user.orgId!, deletedAt: { not: null } as const };
      const campaigns = await db.campaign.findMany({
        where,
        select: {
          id: true,
          name: true,
          deletedAt: true,
          deletedBy: true,
          orgId: true,
          org: { select: { name: true } },
        },
        orderBy: { deletedAt: "desc" },
      });
      const userIds = campaigns.map((c) => c.deletedBy).filter((id): id is string => !!id);
      const users = userIds.length > 0
        ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
        : [];
      const userMap = new Map(users.map((u) => [u.id, u.name || u.email]));
      return campaigns.map((c) => ({
        ...c,
        deletedByName: c.deletedBy ? userMap.get(c.deletedBy) ?? null : null,
      }));
    }),

  restore: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await db.campaign.findUniqueOrThrow({ where: { id: input.id } });
      if (!campaign.deletedAt) {
        throw new Error("Campaign is not deleted");
      }
      if (ctx.user.role === "CUSTOMER" && campaign.orgId !== ctx.user.orgId) {
        throw new Error("Forbidden");
      }
      await db.$transaction([
        db.campaign.update({
          where: { id: input.id },
          data: { deletedAt: null, deletedBy: null },
        }),
        // Re-associate events that had this campaignId before deletion
        db.event.updateMany({
          where: { deletedCampaignId: input.id, deletedAt: null },
          data: { campaignId: input.id, deletedCampaignId: null },
        }),
      ]);
      return { success: true };
    }),

  restoreAll: protectedProcedure.mutation(async ({ ctx }) => {
    const where = ctx.user.role === "ADMIN"
      ? { deletedAt: { not: null } as const }
      : { orgId: ctx.user.orgId!, deletedAt: { not: null } as const };
    const deletedCampaigns = await db.campaign.findMany({ where, select: { id: true } });
    if (deletedCampaigns.length === 0) return { restored: 0 };

    const campaignIds = deletedCampaigns.map((c) => c.id);
    await db.$transaction(async (tx) => {
      await tx.campaign.updateMany({
        where: { id: { in: campaignIds } },
        data: { deletedAt: null, deletedBy: null },
      });
      // Re-associate events for each campaign
      for (const id of campaignIds) {
        await tx.event.updateMany({
          where: { deletedCampaignId: id, deletedAt: null },
          data: { campaignId: id, deletedCampaignId: null },
        });
      }
    });
    return { restored: deletedCampaigns.length };
  }),
});
