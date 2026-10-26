import { getStats } from "@/lib/data";
import { json } from "@/lib/api";
import { dyn } from "@/lib/request";


export async function GET() {
  await dyn();
  return json(getStats(), { maxAge: 15 });
}
