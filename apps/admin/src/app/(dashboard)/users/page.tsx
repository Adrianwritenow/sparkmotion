import { db } from "@sparkmotion/database";
import { UsersContent } from "@/components/users/users-content";

export const dynamic = "force-dynamic";

export type UserStatus = "active" | "pending" | "not_invited";

export interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: "ADMIN" | "CUSTOMER";
  status: UserStatus;
  invitedAt: Date | null;
  createdAt: Date;
  orgId: string | null;
  orgName: string | null;
}

export default async function UsersPage() {
  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      password: true,
      invitedAt: true,
      createdAt: true,
      org: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Derive status server-side — never send password hash to client
  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.password
      ? "active" as const
      : u.invitedAt
        ? "pending" as const
        : "not_invited" as const,
    invitedAt: u.invitedAt,
    createdAt: u.createdAt,
    orgId: u.org?.id ?? null,
    orgName: u.org?.name ?? null,
  }));

  return (
    <div>
      <UsersContent data={rows} />
    </div>
  );
}
