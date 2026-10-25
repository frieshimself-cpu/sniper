import { isAdmin } from "@/lib/auth";
import { getLeads, reviewLead } from "@/lib/data";
import { body, error, json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return error(401, "Admin only.");
  return json({ leads: getLeads() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return error(401, "Admin only.");
  const b = await body<{ id?: string; status?: string }>(req);
  if (!b || typeof b.id !== "string" || (b.status !== "approved" && b.status !== "rejected")) return error(400, "id and status required.");
  const lead = reviewLead(b.id, b.status);
  if (!lead) return error(404, "No such open lead.");
  return json({ ok: true, lead });
}
