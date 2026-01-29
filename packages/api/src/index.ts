export { appRouter, type AppRouter } from "./root";
export {
  router,
  publicProcedure,
  protectedProcedure,
  adminProcedure,
  customerProcedure,
  createTRPCContext,
} from "./trpc";
export type { TRPCContext } from "./trpc";
export { updateEventWindows } from "./services/window-scheduler";
