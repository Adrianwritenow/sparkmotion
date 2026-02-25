export { appRouter, type AppRouter } from "./root";
export {
  router,
  protectedProcedure,
  adminProcedure,
  createTRPCContext,
} from "./trpc";
export { updateEventWindows } from "./services/window-scheduler";
export { generateRedirectMap } from "./services/redirect-map-generator";
export { getEventEngagement, aggregateCampaignEngagement } from "./lib/engagement";
export type { EngagementResult, CampaignEngagementResult } from "./lib/engagement";
