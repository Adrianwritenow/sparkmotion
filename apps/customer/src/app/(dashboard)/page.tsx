import { auth } from "@sparkmotion/auth";
import { db } from "@sparkmotion/database";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.orgId) {
    redirect("/auth/signin");
  }

  const orgId = session.user.orgId;

  // Fetch org-scoped stats
  const [eventCount, bandCount, recentTaps] = await db.$transaction([
    db.event.count({
      where: { orgId },
    }),
    db.band.count({
      where: {
        event: {
          orgId,
        },
      },
    }),
    db.tapLog.count({
      where: {
        band: {
          event: {
            orgId,
          },
        },
        tappedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    }),
  ]);

  return (
    <div>
      <h2 className="text-3xl font-bold mb-6">Dashboard</h2>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{eventCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Bands
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bandCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Taps (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentTaps}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
