import { isAdmin } from "@/lib/auth";
import { buildBallot, candidates } from "@/lib/ballot";
import { body, error, json } from "@/lib/api";


export async function GET() {
  if (!(await isAdmin())) return error(401, "Admin only.");
  return json({ candidates: candidates() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return error(401, "Admin only.");
  const b = await body<{ keys?: string[] }>(req);
  const keys = Array.isArray(b?.keys) ? b!.keys!.filter((k) => typeof k === "string") : undefined;
  try {
    return json({ ok: true, ballot: buildBallot(keys) });
  } catch (e) {
    return error(400, (e as Error).message);
  }
}
