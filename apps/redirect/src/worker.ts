import { Redis } from "@upstash/redis/cloudflare";

interface Env {
  REDIRECT_MAP: KVNamespace;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  LOG_TAP_URL: string;
  LOG_TAP_SECRET: string;
  FALLBACK_URL: string;
}

interface KVEntry {
  url: string;
  eventId: string;
  mode: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    if (url.pathname !== "/e") {
      return new Response("Not Found", { status: 404 });
    }

    const bandId = url.searchParams.get("bandId");
    if (!bandId) {
      return Response.json({ error: "bandId is required" }, { status: 400 });
    }

    // KV lookup — single read, globally replicated
    const entry = await env.REDIRECT_MAP.get<KVEntry>(bandId, "json");

    if (!entry) {
      // Unknown band — redirect to fallback
      return Response.redirect(env.FALLBACK_URL || "https://sparkmotion.io", 302);
    }

    // Fire-and-forget: analytics + DB logging (does NOT block redirect)
    ctx.waitUntil(logTap(env, bandId, entry, request));

    return Response.redirect(entry.url, 302);
  },
} satisfies ExportedHandler<Env>;

async function logTap(env: Env, bandId: string, entry: KVEntry, request: Request): Promise<void> {
  const { eventId, mode } = entry;
  const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const bucket = Math.floor(Date.now() / 10000); // 10-second velocity buckets

  try {
    const upstash = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });

    // Pipeline: 7 commands in 1 HTTP request
    const pipeline = upstash.pipeline();
    pipeline.incr(`analytics:${eventId}:taps:total`);
    pipeline.pfadd(`analytics:${eventId}:taps:unique`, bandId);
    pipeline.pfcount(`analytics:${eventId}:taps:unique`);
    pipeline.incr(`analytics:${eventId}:taps:hourly:${hour}`);
    pipeline.incr(`analytics:${eventId}:mode:${mode}`);
    pipeline.incr(`analytics:${eventId}:velocity:${bucket}`);
    pipeline.expire(`analytics:${eventId}:velocity:${bucket}`, 1800);

    const results = await pipeline.exec();

    // Publish tap update for real-time SSE subscribers
    const totalTaps = results[0] as number;
    const uniqueTaps = results[2] as number;
    await upstash.publish(`tap-updates:${eventId}`, JSON.stringify({
      totalTaps,
      uniqueTaps,
      mode,
    }));
  } catch (err) {
    console.error("Upstash analytics failed:", err);
  }

  // POST to hub for DB writes (best-effort)
  try {
    const userAgent = request.headers.get("user-agent") ?? undefined;
    const ipAddress =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      undefined;

    await fetch(env.LOG_TAP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.LOG_TAP_SECRET}`,
      },
      body: JSON.stringify({
        bandId,
        eventId,
        mode,
        redirectUrl: entry.url,
        userAgent,
        ipAddress,
      }),
    });
  } catch (err) {
    console.error("Log-tap POST failed:", err);
  }
}
