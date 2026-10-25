import { getPerson } from "@/lib/data";
import { error, handleParams, json } from "@/lib/api";
import { dyn, withBase } from "@/lib/dyn";

export const generateStaticParams = handleParams;

export { OPTIONS } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  await dyn();
  const p = getPerson(decodeURIComponent((await params).handle));
  if (!p) return error(404, "No such handle.");
  const { caseList, ...rest } = p;
  return json({ ...rest, cases_list: caseList.map((c) => ({ n: c.n, id: c.id, headline: c.headline, severity: c.severity, url: withBase(`/cases/${c.n}`) })) });
}
