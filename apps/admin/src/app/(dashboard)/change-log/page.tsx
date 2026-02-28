import { ChangeLogsContent } from "@/components/change-logs/change-logs-content";
import { auth } from "@sparkmotion/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AuditLogsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Change Log</h1>
        <p className="text-sm text-muted-foreground">
          System activity
        </p>
      </div>
      <ChangeLogsContent />
    </div>
  );
}
