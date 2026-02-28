import { analyticsRouter } from "./routers/analytics";
import { authRouter } from "./routers/auth";
import { bandsRouter } from "./routers/bands";
import { campaignsRouter } from "./routers/campaigns";
import { changeLogsRouter } from "./routers/change-logs";
import { eventsRouter } from "./routers/events";
import { infrastructureRouter } from "./routers/infrastructure";
import { organizationsRouter } from "./routers/organizations";
import { router } from "./trpc";
import { tagsRouter } from "./routers/tags";
import { usersRouter } from "./routers/users";
import { windowsRouter } from "./routers/windows";

export const appRouter = router({
  auth: authRouter,
  events: eventsRouter,
  windows: windowsRouter,
  bands: bandsRouter,
  analytics: analyticsRouter,
  organizations: organizationsRouter,
  users: usersRouter,
  infrastructure: infrastructureRouter,
  campaigns: campaignsRouter,
  tags: tagsRouter,
  changeLogs: changeLogsRouter,
});

export type AppRouter = typeof appRouter;
