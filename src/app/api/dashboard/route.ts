import { json } from "@/lib/server/http";
import { getDashboard } from "@/lib/server/queries";

export async function GET() {
  return json(getDashboard());
}
