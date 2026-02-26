import { UserRole } from "@sparkmotion/database";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: UserRole;
      orgId: string | null;
      forcePasswordReset: boolean;
    };
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
    role: UserRole;
    orgId: string | null;
    forcePasswordReset: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    email: string;
    name?: string | null;
    role: UserRole;
    orgId: string | null;
    forcePasswordReset: boolean;
  }
}
