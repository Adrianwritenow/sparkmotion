import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../trpc";
import { db } from "@sparkmotion/database";
import { redis } from "@sparkmotion/redis";
import { generateRedirectMap } from "../services/redirect-map-generator";
import {
  ECSClient,
  DescribeServicesCommand,
  UpdateServiceCommand,
} from "@aws-sdk/client-ecs";

// ECS client - connection reuse at module level
const ecsClient = new ECSClient({
  region: process.env.SPARKMOTION_AWS_REGION ?? "us-east-1",
  credentials: process.env.SPARKMOTION_AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.SPARKMOTION_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.SPARKMOTION_AWS_SECRET_ACCESS_KEY!,
      }
    : undefined,
});

// Environment variables for ECS configuration
const ECS_CLUSTER = process.env.SPARKMOTION_ECS_CLUSTER;
const ECS_SERVICE = process.env.SPARKMOTION_ECS_SERVICE;

// Redis key for redirect map metadata
const REDIRECT_MAP_META_KEY = "redirect-map:meta";

// Stale threshold (5 minutes in milliseconds)
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

export const infrastructureRouter = router({
  /**
   * Get ECS service status (running/desired count, health, deployments)
   */
  getServiceStatus: adminProcedure.query(async () => {
    // Check if ECS is configured
    if (!ECS_CLUSTER || !ECS_SERVICE) {
      return {
        runningCount: 0,
        desiredCount: 0,
        status: "NOT_CONFIGURED" as const,
        deployments: [],
        configured: false,
      };
    }

    try {
      const command = new DescribeServicesCommand({
        cluster: ECS_CLUSTER,
        services: [ECS_SERVICE],
      });

      const response = await ecsClient.send(command);
      const service = response.services?.[0];

      if (!service) {
        return {
          runningCount: 0,
          desiredCount: 0,
          status: "NOT_FOUND" as const,
          deployments: [],
          configured: true,
        };
      }

      return {
        runningCount: service.runningCount ?? 0,
        desiredCount: service.desiredCount ?? 0,
        status: service.status ?? "UNKNOWN",
        deployments: (service.deployments ?? []).map((d) => ({
          id: d.id,
          status: d.status,
          runningCount: d.runningCount ?? 0,
          desiredCount: d.desiredCount ?? 0,
          createdAt: d.createdAt?.toISOString(),
        })),
        configured: true,
      };
    } catch (error) {
      console.error("ECS DescribeServices error:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch ECS service status",
      });
    }
  }),

  /**
   * Scale ECS service to a specified task count
   */
  scale: adminProcedure
    .input(
      z.object({
        desiredCount: z.number().int().min(2).max(100),
      })
    )
    .mutation(async ({ input }) => {
      // Check if ECS is configured
      if (!ECS_CLUSTER || !ECS_SERVICE) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "ECS not configured. Set SPARKMOTION_ECS_CLUSTER and SPARKMOTION_ECS_SERVICE environment variables.",
        });
      }

      try {
        const command = new UpdateServiceCommand({
          cluster: ECS_CLUSTER,
          service: ECS_SERVICE,
          desiredCount: input.desiredCount,
        });

        await ecsClient.send(command);

        return {
          success: true,
          desiredCount: input.desiredCount,
        };
      } catch (error) {
        console.error("ECS UpdateService error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to scale ECS service",
        });
      }
    }),

  /**
   * Get redirect map metadata (lastRefreshed, bandCount, sizeBytes)
   */
  getMapStatus: adminProcedure.query(async () => {
    try {
      const metaJson = await redis.get(REDIRECT_MAP_META_KEY);

      if (!metaJson) {
        return {
          lastRefreshed: null,
          bandCount: 0,
          sizeBytes: 0,
          isStale: true,
        };
      }

      const meta = JSON.parse(metaJson) as {
        lastRefreshed: string;
        bandCount: number;
        sizeBytes: number;
      };

      const lastRefreshedDate = new Date(meta.lastRefreshed);
      const isStale = Date.now() - lastRefreshedDate.getTime() > STALE_THRESHOLD_MS;

      return {
        lastRefreshed: meta.lastRefreshed,
        bandCount: meta.bandCount,
        sizeBytes: meta.sizeBytes,
        isStale,
      };
    } catch (error) {
      console.error("Redis get error:", error);
      return {
        lastRefreshed: null,
        bandCount: 0,
        sizeBytes: 0,
        isStale: true,
      };
    }
  }),

  /**
   * Trigger redirect map refresh
   */
  refreshMap: adminProcedure.mutation(async () => {
    try {
      const result = await generateRedirectMap();

      if (result.skipped) {
        return {
          success: true,
          bandsWritten: 0,
          eventsProcessed: 0,
          skipped: true,
        };
      }

      // Update metadata in Redis
      const meta = {
        lastRefreshed: new Date().toISOString(),
        bandCount: result.bandsWritten,
        sizeBytes: result.bandsWritten * 100, // Rough estimate: ~100 bytes per entry
      };

      await redis.set(REDIRECT_MAP_META_KEY, JSON.stringify(meta));

      return {
        success: true,
        bandsWritten: result.bandsWritten,
        eventsProcessed: result.eventsProcessed,
        skipped: false,
      };
    } catch (error) {
      console.error("Redirect map refresh error:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to refresh redirect map",
      });
    }
  }),

  /**
   * Project costs based on upcoming events with estimatedAttendees
   */
  costProjection: adminProcedure
    .input(
      z.object({
        days: z.enum(["7", "14", "30"]),
      })
    )
    .query(async ({ input }) => {
      const daysNum = parseInt(input.days, 10);
      const now = new Date();
      const endDate = new Date(now.getTime() + daysNum * 24 * 60 * 60 * 1000);

      // Get upcoming active events with estimatedAttendees in the date range
      // We'll look for events with windows starting within the range
      const upcomingEvents = await db.event.findMany({
        where: {
          status: "ACTIVE",
          estimatedAttendees: { not: null },
          windows: {
            some: {
              startTime: {
                gte: now,
                lte: endDate,
              },
            },
          },
        },
        include: {
          windows: {
            where: {
              startTime: {
                gte: now,
                lte: endDate,
              },
            },
            orderBy: { startTime: "asc" },
          },
        },
      });

      // Calculate metrics
      const totalEstimatedAttendees = upcomingEvents.reduce(
        (sum, event) => sum + (event.estimatedAttendees ?? 0),
        0
      );

      // Count unique event days (days with at least one window)
      const eventDays = new Set<string>();
      for (const event of upcomingEvents) {
        for (const window of event.windows) {
          if (window.startTime) {
            const dateStr = window.startTime.toISOString().split("T")[0];
            if (dateStr) {
              eventDays.add(dateStr);
            }
          }
        }
      }
      const uniqueEventDays = eventDays.size;

      // Calculate total expected taps: each attendee taps once per window
      const totalExpectedTaps = upcomingEvents.reduce(
        (sum, event) => sum + (event.estimatedAttendees ?? 0) * event.windows.length,
        0
      );
      const totalWindows = upcomingEvents.reduce((sum, event) => sum + event.windows.length, 0);

      // Calculate recommended tasks
      // 10K req/s per task, based on peak concurrent attendees per window
      // Minimum 2 tasks for redundancy
      const recommendedTasks = Math.max(
        2,
        Math.ceil(totalEstimatedAttendees / 10000)
      );

      // Calculate hours (8 hours per event day)
      const eventHours = uniqueEventDays * 8;

      // Fargate cost: $0.04048 per vCPU-hour (1 vCPU per task)
      const fargateCost = recommendedTasks * eventHours * 0.04048;

      // Redis cost: 1 tap per attendee per window, 2 commands per tap, $0.20 per 1M commands
      const redisCost = (totalExpectedTaps * 2 / 1000000) * 0.20;

      // Total cost
      const totalCost = fargateCost + redisCost;

      return {
        upcomingEvents: upcomingEvents.map((e) => ({
          id: e.id,
          name: e.name,
          estimatedAttendees: e.estimatedAttendees,
          windowCount: e.windows.length,
        })),
        totalEstimatedAttendees,
        totalExpectedTaps,
        totalWindows,
        uniqueEventDays,
        recommendedTasks,
        eventHours,
        fargateCost: Math.round(fargateCost * 100) / 100,
        redisCost: Math.round(redisCost * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        projectionDays: daysNum,
      };
    }),
});
