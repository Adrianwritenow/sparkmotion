"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { EventForm } from "./event-form";

interface EventFormWrapperProps {
  orgId: string;
}

export function EventFormWrapper({ orgId }: EventFormWrapperProps) {
  const router = useRouter();
  const createEvent = trpc.events.create.useMutation({
    onSuccess: () => {
      router.push("/events");
      router.refresh();
    },
  });

  const handleSubmit = async (values: {
    name: string;
    tourName?: string;
    slug: string;
    preUrl: string;
    liveUrl: string;
    postUrl: string;
  }) => {
    await createEvent.mutateAsync({
      ...values,
      orgId,
    });
  };

  return (
    <EventForm
      onSubmit={handleSubmit}
      isPending={createEvent.isPending}
    />
  );
}
