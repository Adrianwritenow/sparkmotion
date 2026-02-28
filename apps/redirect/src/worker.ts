import { Redis } from "@upstash/redis/cloudflare";

interface Env {
  REDIRECT_MAP: KVNamespace;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  FALLBACK_URL: string;
  HUB_URL: string;
}

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-XSS-Protection": "1; mode=block",
};

function withSecurityHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

interface KVEntry {
  url: string;
  eventId: string;
  mode: string;
  windowId: string | null;
}

function extractOrgSlug(hostname: string): string | null {
  const parts = hostname.split(".");
  if (parts.length >= 3) return parts[0] ?? null;
  return null;
}

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function scanModeResponse(bandId: string): Response {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Band Scanned</title>
<style>
  body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;
  min-height:100vh;margin:0;background:#111;color:#fff;text-align:center}
  .card{padding:2rem}
  .check{font-size:3rem;margin-bottom:1rem}
  h1{font-size:1.25rem;margin:0 0 .5rem}
  p{color:#aaa;font-size:.875rem;margin:0}
  code{background:#222;padding:.125rem .375rem;border-radius:4px;font-size:.8rem}
</style></head><body>
<div class="card">
  <div class="check">&#10003;</div>
  <h1>Band Scanned</h1>
  <p><code>${bandId}</code></p>
  <p style="margin-top:1rem">Switch back to the Scan Editor tab.</p>
</div>
<script>
document.cookie="sm-scanned-band=${bandId};domain=.sparkmotion.net;path=/;max-age=30;SameSite=Lax";
</script>
</body></html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
      ...SECURITY_HEADERS,
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return withSecurityHeaders(Response.json({ status: "ok" }));
    }

    if (url.pathname !== "/e") {
      return withSecurityHeaders(Response.json({ error: "Not found" }, { status: 404 }));
    }

    const bandId = url.searchParams.get("bandId");
    if (!bandId) {
      return withSecurityHeaders(Response.json({ error: "bandId is required" }, { status: 400 }));
    }

    // Scan-mode: editor has cookie set — return band ID page, skip normal redirect
    const scanMode = parseCookie(request.headers.get("Cookie"), "sm-scan-mode");
    if (scanMode) {
      return scanModeResponse(bandId);
    }

    const utmParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

    // KV lookup — edge-cached for 5 min (band→URL mappings rarely change)
    const entry = await env.REDIRECT_MAP.get<KVEntry>(bandId, { type: "json", cacheTtl: 300 });

    if (!entry) {
      // KV miss — proxy to Hub for auto-assignment, GeoIP, DB access
      const orgSlug = extractOrgSlug(url.hostname);
      const hubUrl = new URL("/e", env.HUB_URL);
      hubUrl.searchParams.set("bandId", bandId);
      if (orgSlug) hubUrl.searchParams.set("orgSlug", orgSlug);
      for (const p of utmParams) {
        const val = url.searchParams.get(p);
        if (val) hubUrl.searchParams.set(p, val);
      }

      try {
        const cf = (request as any).cf;
        const hubResponse = await fetch(hubUrl.toString(), {
          headers: {
            "x-forwarded-for": request.headers.get("cf-connecting-ip") ?? "",
            "user-agent": request.headers.get("user-agent") ?? "",
            "x-real-latitude": cf?.latitude?.toString() ?? "",
            "x-real-longitude": cf?.longitude?.toString() ?? "",
          },
          redirect: "manual",
        });
        return withSecurityHeaders(hubResponse);
      } catch {
        return withSecurityHeaders(new Response(null, {
          status: 302,
          headers: { Location: env.FALLBACK_URL || "https://sparkmotion.io" },
        }));
      }
    }

    // Append UTM parameters from request to redirect URL
    let redirectUrl = entry.url;
    const hasUtm = utmParams.some((p) => url.searchParams.has(p));
    if (hasUtm) {
      const dest = new URL(entry.url);
      for (const p of utmParams) {
        const val = url.searchParams.get(p);
        if (val) dest.searchParams.set(p, val);
      }
      redirectUrl = dest.toString();
    }

    // Fire-and-forget: analytics + DB logging (does NOT block redirect)
    ctx.waitUntil(logTap(env, bandId, entry, request));

    return withSecurityHeaders(new Response(null, {
      status: 302,
      headers: { Location: redirectUrl },
    }));
  },
} satisfies ExportedHandler<Env>;

// Cache Redis client per isolate (avoids re-creating on every request)
let _redis: Redis | null = null;
function getRedis(env: Env): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return _redis;
}

async function logTap(env: Env, bandId: string, entry: KVEntry, request: Request): Promise<void> {
  const { eventId, mode } = entry;
  const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const bucket = Math.floor(Date.now() / 10000); // 10-second velocity buckets

  try {
    const upstash = getRedis(env);

    // Pipeline: 7 commands in 1 HTTP request (analytics + tap log queue)
    const pipeline = upstash.pipeline();
    pipeline.incr(`analytics:${eventId}:taps:total`);
    pipeline.pfadd(`analytics:${eventId}:taps:unique`, bandId);
    pipeline.incr(`analytics:${eventId}:taps:hourly:${hour}`);
    pipeline.incr(`analytics:${eventId}:mode:${mode}`);
    pipeline.incr(`analytics:${eventId}:velocity:${bucket}`);
    pipeline.expire(`analytics:${eventId}:velocity:${bucket}`, 1800);

    // Queue tap for batch DB flush (replaces per-tap HTTP POST)
    pipeline.lpush("tap-log:pending", JSON.stringify({
      bandId,
      eventId,
      mode,
      windowId: entry.windowId ?? undefined,
      redirectUrl: entry.url,
      userAgent: request.headers.get("user-agent") ?? undefined,
      ipAddress: request.headers.get("cf-connecting-ip") ??
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        undefined,
      tappedAt: new Date().toISOString(),
    }));

    await pipeline.exec();
  } catch (err) {
    console.error("Upstash analytics failed:", err);
  }
}
