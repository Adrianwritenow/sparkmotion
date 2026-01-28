"use client";

import { EventForm } from "@/components/events/event-form";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";

interface EventFormWrapperProps {
  orgs: Array<{ id: string; name: string }>;
}

export function EventFormWrapper({ orgs }: EventFormWrapperProps) {
  const router = useRouter();
  const createEvent = trpc.events.create.useMutation({
    onSuccess: () => {
      router.push("/events");
      router.refresh();
    },
  });

  const handleSubmit = async (values: any) => {
    await createEvent.mutateAsync(values);
  };

  return (
    <EventForm
      onSubmit={handleSubmit}
      isPending={createEvent.isPending}
      orgs={orgs}
    />
  );
}
