import type { NextRequest } from "next/server";
import { json } from "@/lib/server/http";
import { getRadar } from "@/lib/server/radar";

export async function GET(req: NextRequest) {
  const radar = getRadar();
  if (req.nextUrl.searchParams.get("panel") !== "1") return json(radar);
  // The dashboard panel shows the newest item of each type.
  const items = (["release", "research", "update", "repository"] as const).flatMap((t) => radar.items.filter((i) => i.type === t).slice(0, 3));
  return json({ ...radar, items, sources: [] });
}
