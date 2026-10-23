import { getStats } from "@/lib/data";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";
export { OPTIONS } from "@/lib/api";

export function GET() {
  return json(getStats(), { maxAge: 15 });
}
