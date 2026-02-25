import { db } from "@sparkmotion/database";
import { UsersContent } from "@/components/users/users-content";

export default async function UsersPage() {
  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      org: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold">Users</h2>
      </div>

      <UsersContent data={users} />
    </div>
  );
}
