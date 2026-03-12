import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { db, Prisma } from "@sparkmotion/database";
import { enforceOrgAccess, getOrgFilter } from "../lib/auth";
import { getEventEngagement, aggregateCampaignEngagement } from "../lib/engagement";
import { ACTIVE } from "../lib/soft-delete";
import { createTrashProcedures } from "../lib/trash";

export const campaignsRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const where = { ...getOrgFilter(ctx, input?.orgId), ...ACTIVE };
      const campaigns = await db.campaign.findMany({
        where,
        include: {
          org: true,
          events: {
            where: { ...ACTIVE },
            select: { id: true, location: true, estimatedAttendees: true, _count: { select: { bands: { where: { ...ACTIVE } } } } },
          },
          _count: { select: { events: { where: { ...ACTIVE } } } },
        },
        orderBy: { createdAt: "desc" },
      });

      // Add aggregate engagement data from DB
      const allEventIds = campaigns.flatMap((c) => c.events.map((e) => e.id));
      const estimatedAttendeesByEvent = new Map(
        campaigns.flatMap((c) => c.events.map((e) => [e.id, e.estimatedAttendees] as const))
      );
      const engagementMap = await getEventEngagement(allEventIds, estimatedAttendeesByEvent);

      return campaigns.map((campaign) => {
        const result = aggregateCampaignEngagement(campaign.events, engagementMap);
        const totalBands = campaign.events.reduce((sum, e) => sum + e._count.bands, 0);
        const locations = campaign.events
          .map((e) => e.location)
          .filter((loc): loc is string => !!loc);
        return {
          ...campaign,
          aggregateEngagement: result.aggregateEngagement,
          totalBands,
          locations,
        };
      });
    }),

  listIds: protectedProcedure
    .input(z.object({
      orgId: z.string().optional(),
      search: z.string().optional(),
      status: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const where: any = {
        ...ACTIVE,
        ...getOrgFilter(ctx, input?.orgId),
        ...(input?.search ? { name: { contains: input.search, mode: "insensitive" } } : {}),
        ...(input?.status ? { status: input.status } : {}),
      };
      const campaigns = await db.campaign.findMany({
        where,
        select: { id: true },
      });
      return { ids: campaigns.map((c) => c.id) };
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const campaign = await db.campaign.findUniqueOrThrow({
        where: { id: input.id, ...ACTIVE },
        include: {
          org: true,
          events: {
            where: { ...ACTIVE },
            orderBy: { createdAt: "desc" },
            select: { id: true, location: true, estimatedAttendees: true, _count: { select: { bands: { where: { ...ACTIVE } } } } },
          },
          _count: { select: { events: { where: { ...ACTIVE } } } },
        },
      });

      // Add aggregate engagement data from DB
      const eventIds = campaign.events.map((e) => e.id);
      const estimatedAttendeesByEvent = new Map(
        campaign.events.map((e) => [e.id, e.estimatedAttendees] as const)
      );
      const engagementMap = await getEventEngagement(eventIds, estimatedAttendeesByEvent);

      const result = aggregateCampaignEngagement(campaign.events, engagementMap);
      const totalBands = campaign.events.reduce((sum, e) => sum + e._count.bands, 0);
      const locations = campaign.events
        .map((e) => e.location)
        .filter((loc): loc is string => !!loc);

      return {
        ...campaign,
        aggregateEngagement: result.aggregateEngagement,
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

      const campaign = await db.campaign.findUniqueOrThrow({
        where: { id, ...ACTIVE },
        select: { orgId: true },
      });
      enforceOrgAccess(ctx, campaign.orgId);

      return db.campaign.update({ where: { id }, data });
    }),

  availableEvents: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ input }) => {
      const campaign = await db.campaign.findUniqueOrThrow({
        where: { id: input.campaignId, ...ACTIVE },
        select: { orgId: true },
      });
      return db.event.findMany({
        where: { orgId: campaign.orgId, campaignId: null, ...ACTIVE },
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
      const campaign = await db.campaign.findUniqueOrThrow({
        where: { id: input.id, ...ACTIVE },
        select: { orgId: true },
      });
      enforceOrgAccess(ctx, campaign.orgId);

      const now = new Date();
      await db.$transaction([
        db.campaign.update({
          where: { id: input.id },
          data: { deletedAt: now, deletedBy: ctx.user.id },
        }),
        db.event.updateMany({
          where: { campaignId: input.id, ...ACTIVE },
          data: { deletedCampaignId: input.id, campaignId: null },
        }),
      ]);
    }),

  deleteMany: protectedProcedure
    .input(z.object({
      ids: z.array(z.string()).min(1).max(50),
      deleteEvents: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const campaigns = await db.campaign.findMany({
        where: { id: { in: input.ids }, ...ACTIVE },
      });

      if (campaigns.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No campaigns found" });
      }

      if (ctx.user.role === "CUSTOMER") {
        const unauthorized = campaigns.some((c) => c.orgId !== ctx.user.orgId);
        if (unauthorized) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      const now = new Date();
      const campaignIds = campaigns.map((c) => c.id);

      await db.$transaction(async (tx) => {
        for (const id of campaignIds) {
          if (input.deleteEvents) {
            // Soft-delete associated events and their bands
            const events = await tx.event.findMany({
              where: { campaignId: id, ...ACTIVE },
              select: { id: true },
            });
            const eventIds = events.map((e) => e.id);
            if (eventIds.length > 0) {
              await tx.band.updateMany({
                where: { eventId: { in: eventIds }, ...ACTIVE },
                data: { deletedAt: now, deletedBy: ctx.user.id },
              });
              await tx.event.updateMany({
                where: { id: { in: eventIds } },
                data: { deletedAt: now, deletedBy: ctx.user.id, deletedCampaignId: id, campaignId: null },
              });
            }
          } else {
            // Unlink events from campaign (preserve them)
            await tx.event.updateMany({
              where: { campaignId: id, ...ACTIVE },
              data: { deletedCampaignId: id, campaignId: null },
            });
          }
        }
        await tx.campaign.updateMany({
          where: { id: { in: campaignIds } },
          data: { deletedAt: now, deletedBy: ctx.user.id },
        });
      });

      return { deletedCount: campaigns.length };
    }),

  duplicate: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(50) }))
    .mutation(async ({ input, ctx }) => {
      const campaigns = await db.campaign.findMany({
        where: { id: { in: input.ids }, ...ACTIVE },
        include: {
          events: {
            where: { ...ACTIVE },
            include: { windows: true },
          },
        },
      });

      if (campaigns.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No campaigns found" });
      }

      if (ctx.user.role === "CUSTOMER") {
        const unauthorized = campaigns.some((c) => c.orgId !== ctx.user.orgId);
        if (unauthorized) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      return db.$transaction(async (tx) => {
        const created = [];
        for (const campaign of campaigns) {
          const newCampaign = await tx.campaign.create({
            data: {
              name: `${campaign.name} (Copy)`,
              orgId: campaign.orgId,
              status: "DRAFT",
              startDate: campaign.startDate,
              endDate: campaign.endDate,
            },
          });
          for (const event of campaign.events) {
            await tx.event.create({
              data: {
                name: `${event.name} (Copy)`,
                orgId: event.orgId,
                campaignId: newCampaign.id,
                city: event.city,
                state: event.state,
                country: event.country,
                zipcode: event.zipcode,
                location: event.location,
                venueName: event.venueName,
                formattedAddress: event.formattedAddress,
                latitude: event.latitude,
                longitude: event.longitude,
                timezone: event.timezone,
                scheduleMode: event.scheduleMode,
                fallbackUrl: event.fallbackUrl,
                estimatedAttendees: event.estimatedAttendees,
                startDate: event.startDate,
                endDate: event.endDate,
                status: "DRAFT",
                windows: {
                  create: event.windows.map((w) => ({
                    windowType: w.windowType,
                    url: w.url,
                    startTime: w.startTime,
                    endTime: w.endTime,
                    isManual: w.isManual,
                    isActive: false,
                  })),
                },
              },
            });
          }
          created.push(newCampaign);
        }
        return created;
      });
    }),

  ...createTrashProcedures({
    model: "campaign",
    selectFields: {
      id: true,
      name: true,
      deletedAt: true,
      deletedBy: true,
      orgId: true,
      org: { select: { name: true } },
    },
    getOrgId: (campaign) => campaign.orgId,
    onRestore: async (id, campaign, ctx) => {
      await db.$transaction([
        db.campaign.update({
          where: { id },
          data: { deletedAt: null, deletedBy: null },
        }),
        // Re-associate events that had this campaignId before deletion
        db.event.updateMany({
          where: { deletedCampaignId: id, ...ACTIVE },
          data: { campaignId: id, deletedCampaignId: null },
        }),
      ]);
      return { success: true };
    },
    onRestoreAll: async (campaigns, ctx) => {
      const campaignIds = campaigns.map((c: any) => c.id);
      await db.$transaction(async (tx) => {
        await tx.campaign.updateMany({
          where: { id: { in: campaignIds } },
          data: { deletedAt: null, deletedBy: null },
        });
        // Re-associate events for each campaign
        for (const id of campaignIds) {
          await tx.event.updateMany({
            where: { deletedCampaignId: id, ...ACTIVE },
            data: { campaignId: id, deletedCampaignId: null },
          });
        }
      });
      return { restored: campaigns.length };
    },
  }),
});
