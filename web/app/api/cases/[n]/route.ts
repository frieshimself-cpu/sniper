import { getCase } from "@/lib/data";
import { error, json } from "@/lib/api";

export const dynamic = "force-dynamic";
export { OPTIONS } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ n: string }> }) {
  const n = Number((await params).n);
  const c = Number.isInteger(n) ? getCase(n) : null;
  if (!c) return error(404, "No such case.");
  return json({ ...c, url: `/cases/${c.n}`, card: `/cases/${c.n}/card.png`, csv: `/cases/${c.n}/evidence.csv` });
}
