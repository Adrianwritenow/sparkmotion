import { NextRequest, NextResponse } from "next/server";

const apiBaseUrl = process.env.AUTH_REMOTE_URL ?? "http://localhost:3003";

async function proxy(req: NextRequest) {
  const url = new URL(req.nextUrl.pathname + req.nextUrl.search, apiBaseUrl);
  const headers = new Headers(req.headers);
  headers.set("host", new URL(apiBaseUrl).host);

  const init: RequestInit = {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
  };

  const response = await fetch(url, init);
  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}

export async function GET(req: NextRequest) {
  return proxy(req);
}

export async function POST(req: NextRequest) {
  return proxy(req);
}
