import { NextResponse, type NextRequest } from "next/server";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "cache-control": "no-store", ...(init?.headers ?? {}) } });
}

export function error(status: number, message: string) {
  return json({ error: message }, { status });
}

/**
 * Reject cross-site writes. Browsers send Basic-Auth credentials automatically,
 * so state-changing endpoints must verify the request came from this app.
 */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function parseIntParam(value: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
