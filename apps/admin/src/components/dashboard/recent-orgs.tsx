import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { AddOrgButton } from "@/components/organizations/add-org-button";

interface RecentOrgsProps {
  orgs: Array<{
    id: string;
    name: string;
    slug: string;
    eventCount: number;
  }>;
}

export function RecentOrgs({ orgs }: RecentOrgsProps) {
  const avatarColors = [
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  ];

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold text-foreground text-lg">
          Recent Organizations
        </h3>
        <Link
          href="/organizations"
          className="text-sm text-primary hover:underline"
        >
          View All
        </Link>
      </div>
      <div className="space-y-4">
        {orgs.map((org, i) => (
          <Link
            key={org.id}
            href={`/organizations/${org.id}`}
            className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${
                  avatarColors[i % 4]
                }`}
              >
                {getInitials(org.name)}
              </div>
              <div>
                <p className="font-medium text-sm text-foreground">
                  {org.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {org.eventCount} active event{org.eventCount !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
      <AddOrgButton className="w-full mt-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md hover:bg-muted/50 transition-colors flex items-center justify-center gap-2" />
    </div>
  );
}
