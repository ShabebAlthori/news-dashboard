// Optional HTTP Basic authentication for the whole dashboard.
// Enabled only when both DASHBOARD_USER and DASHBOARD_PASSWORD are set.
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export function proxy(request: NextRequest) {
  const user = process.env.DASHBOARD_USER;
  const password = process.env.DASHBOARD_PASSWORD;
  if (!user || !password) return NextResponse.next();

  // External schedulers authenticate to /api/refresh with CRON_SECRET instead.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.nextUrl.pathname === "/api/refresh" && request.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return NextResponse.next();
  }

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep > 0 && safeEqual(decoded.slice(0, sep), user) && safeEqual(decoded.slice(sep + 1), password)) {
      return NextResponse.next();
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="News Dashboard", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
