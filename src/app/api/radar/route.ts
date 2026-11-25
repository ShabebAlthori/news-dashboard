import { json } from "@/lib/server/http";
import { getRadar } from "@/lib/server/radar";

export async function GET() {
  return json(getRadar());
}
