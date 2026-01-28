import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@sparkmotion/api";
import type { TRPCContext } from "@sparkmotion/api";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: (): TRPCContext => ({
      user: null, // TODO: wire up real auth
    }),
  });

export { handler as GET, handler as POST };
