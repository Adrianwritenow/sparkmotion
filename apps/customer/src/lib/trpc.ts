import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@sparkmotion/api";

export const trpc = createTRPCReact<AppRouter>();
