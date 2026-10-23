import fs from "node:fs";
import { cardPath } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ n: string }> }) {
  const n = Number((await params).n);
  const file = Number.isInteger(n) ? cardPath(n) : null;
  if (!file) return new Response("No such card.", { status: 404 });
  const stat = fs.statSync(file);
  return new Response(fs.readFileSync(file), {
    headers: {
      "content-type": "image/png",
      "content-length": String(stat.size),
      "cache-control": "public, max-age=300",
      "last-modified": stat.mtime.toUTCString(),
    },
  });
}
