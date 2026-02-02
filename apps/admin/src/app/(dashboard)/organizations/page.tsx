import { db } from "@sparkmotion/database";
import { OrgsAnalytics } from "@/components/organizations/orgs-analytics";
import { OrgsTable } from "@/components/organizations/orgs-table";

export default async function OrganizationsPage() {
  const organizations = await db.organization.findMany({
    include: {
      _count: {
        select: {
          events: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold">Organizations</h2>
      </div>

      <OrgsAnalytics />

      <div className="mt-6">
        <h3 className="text-xl font-semibold mb-4">All Organizations</h3>
        <OrgsTable data={organizations} />
      </div>
    </div>
  );
}
