import { auth } from "@sparkmotion/auth";
import { redirect } from "next/navigation";
import { EventFormWrapper } from "@/components/events/event-form-wrapper";

export default async function NewEventPage() {
  const session = await auth();

  if (!session?.user?.orgId) {
    redirect("/signin");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Event</h1>
        <p className="text-muted-foreground mt-2">
          Add a new event to your organization
        </p>
      </div>

      <div className="max-w-2xl">
        <EventFormWrapper orgId={session.user.orgId} />
      </div>
    </div>
  );
}
