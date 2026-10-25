import { getCase } from "@/lib/data";
import { error, json } from "@/lib/api";
import { dyn, withBase } from "@/lib/dyn";



export async function GET(_req: Request, { params }: { params: Promise<{ n: string }> }) {
  await dyn();
  const n = Number((await params).n);
  const c = Number.isInteger(n) ? getCase(n) : null;
  if (!c) return error(404, "No such case.");
  return json({ ...c, url: withBase(`/cases/${c.n}`), card: withBase(`/cases/${c.n}/card.png`), csv: withBase(`/cases/${c.n}/evidence.csv`) });
}
