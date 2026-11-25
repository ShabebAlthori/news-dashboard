import type { NextRequest } from "next/server";
import { error, isSameOrigin, json } from "@/lib/server/http";
import { rescheduleAfterSettingsChange } from "@/lib/server/scheduler";
import { getPrefs, PrefsSchema, updatePrefs } from "@/lib/server/settings";

export async function GET() {
  return json(getPrefs());
}

export async function PUT(request: NextRequest) {
  if (!isSameOrigin(request)) return error(403, "Forbidden");
  const body = await request.json().catch(() => null);
  const parsed = PrefsSchema.partial().safeParse(body);
  if (!parsed.success) return error(400, "Invalid settings");
  const before = getPrefs();
  const next = updatePrefs(parsed.data);
  if (before.refreshMinutes !== next.refreshMinutes) rescheduleAfterSettingsChange();
  return json(next);
}
