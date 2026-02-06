import { router } from "./trpc";
import { eventsRouter } from "./routers/events";
import { windowsRouter } from "./routers/windows";
import { bandsRouter } from "./routers/bands";
import { analyticsRouter } from "./routers/analytics";
import { organizationsRouter } from "./routers/organizations";
import { usersRouter } from "./routers/users";
import { infrastructureRouter } from "./routers/infrastructure";
import { loadTestReportsRouter } from "./routers/load-test-reports";

export const appRouter = router({
  events: eventsRouter,
  windows: windowsRouter,
  bands: bandsRouter,
  analytics: analyticsRouter,
  organizations: organizationsRouter,
  users: usersRouter,
  infrastructure: infrastructureRouter,
  loadTestReports: loadTestReportsRouter,
});

export type AppRouter = typeof appRouter;
