import { NextRequest, NextResponse } from "next/server";
import { createTapSubscriber } from "@sparkmotion/redis";

export const runtime = "nodejs"; // Required for ioredis
export const maxDuration = 300; // Vercel Fluid Compute max

const encoder = new TextEncoder();

function formatSSE(event: string, data: object): Uint8Array {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return encoder.encode(message);
}

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId");

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const stream = new ReadableStream({
    start(controller) {
      // Subscribe to tap updates
      const cleanup = createTapSubscriber(eventId, (data) => {
        controller.enqueue(formatSSE("tap-update", data));
      });

      // Send heartbeat every 30s to prevent proxy timeouts
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 30000);

      // Cleanup on connection close
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        cleanup();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
