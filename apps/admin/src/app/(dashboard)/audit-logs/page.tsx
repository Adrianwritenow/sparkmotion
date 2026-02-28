import { auth } from "@sparkmotion/auth";
import { redirect } from "next/navigation";
import { AuditLogsContent } from "@/components/audit-logs/audit-logs-content";

export const dynamic = "force-dynamic";

export default async function AuditLogsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          SOC 2 compliance audit trail — all system activity
        </p>
      </div>
      <AuditLogsContent />
    </div>
  );
}
