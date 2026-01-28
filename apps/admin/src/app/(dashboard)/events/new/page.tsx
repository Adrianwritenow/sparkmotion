import { db } from "@sparkmotion/database";
import { EventFormWrapper } from "@/components/events/event-form-wrapper";

export default async function NewEventPage() {
  const orgs = await db.organization.findMany({
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return (
    <div className="max-w-2xl">
      <h2 className="text-3xl font-bold mb-6">Create Event</h2>

      <div className="bg-white rounded-lg border p-6">
        <EventFormWrapper orgs={orgs} />
      </div>
    </div>
  );
}
