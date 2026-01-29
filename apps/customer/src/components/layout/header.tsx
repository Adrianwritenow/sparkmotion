import { auth } from "@sparkmotion/auth";
import { db } from "@sparkmotion/database";

export async function Header() {
  const session = await auth();

  let orgName = "My Organization";

  if (session?.user?.orgId) {
    const org = await db.organization.findUnique({
      where: { id: session.user.orgId },
      select: { name: true },
    });

    if (org) {
      orgName = org.name;
    }
  }

  return (
    <header className="border-b bg-white px-6 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">SparkMotion</h1>
        <div className="text-sm text-muted-foreground">{orgName}</div>
      </div>
    </header>
  );
}
