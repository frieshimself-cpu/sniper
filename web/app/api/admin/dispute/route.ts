import { isAdmin } from "@/lib/auth";
import { getDisputes, reviewDispute } from "@/lib/store";
import { body, error, json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return error(401, "Admin only.");
  return json({ disputes: getDisputes() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return error(401, "Admin only.");
  const b = await body<{ wallet?: string; status?: string }>(req);
  if (!b || typeof b.wallet !== "string" || (b.status !== "removed" && b.status !== "kept")) return error(400, "wallet and status required.");
  const d = reviewDispute(b.wallet, b.status);
  if (!d) return error(404, "No such dispute.");
  return json({ ok: true, dispute: d });
}
