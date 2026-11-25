import { json } from "@/lib/server/http";
import { getStatus } from "@/lib/server/status";

export async function GET() {
  return json(getStatus());
}
