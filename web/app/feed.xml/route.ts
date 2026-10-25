import { atomFeed } from "@/lib/feed";
import { dyn } from "@/lib/dyn";

export async function GET() {
  await dyn();
  return new Response(atomFeed(), { headers: { "content-type": "application/atom+xml; charset=utf-8", "cache-control": "public, max-age=300" } });
}
