import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";

interface RecentEventsTableProps {
  events: Array<{
    id: string;
    name: string;
    status: string;
    updatedAt: Date;
  }>;
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    Active:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    Draft:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    Completed: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
    Cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  const dotStyles = {
    Active: "bg-green-600",
    Draft: "bg-blue-600",
    Completed: "bg-gray-500",
    Cancelled: "bg-red-600",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        styles[status as keyof typeof styles] || styles.Completed
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
          dotStyles[status as keyof typeof dotStyles] || dotStyles.Completed
        }`}
      />
      {status}
    </span>
  );
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

export function RecentEventsTable({ events }: RecentEventsTableProps) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-lg">Recent Events</h3>
        <Link href="/events" className="text-sm text-primary hover:underline">
          View All
        </Link>
      </div>

      {/* Desktop table view (1024px+) */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
            <tr>
              <th className="px-6 py-3 font-medium">Event Name</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium">Time</th>
              <th className="px-6 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map((event) => (
              <tr
                key={event.id}
                className="bg-card hover:bg-muted/50 transition-colors"
              >
                <td className="px-6 py-4 font-medium text-foreground">
                  {event.name}
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={event.status} />
                </td>
                <td className="px-6 py-4 text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {getRelativeTime(event.updatedAt)}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/events/${event.id}`}
                    className="text-muted-foreground hover:text-primary transition-colors inline-block"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile/tablet card view (<1024px) */}
      <div className="lg:hidden divide-y divide-border">
        {events.map((event) => (
          <div
            key={event.id}
            className="p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <span className="font-medium text-foreground">{event.name}</span>
              <StatusBadge status={event.status} />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {getRelativeTime(event.updatedAt)}
              </span>
              <Link
                href={`/events/${event.id}`}
                className="text-primary hover:underline"
              >
                View Details
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
