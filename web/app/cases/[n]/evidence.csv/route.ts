import { getCase } from "@/lib/data";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(_req: Request, { params }: { params: Promise<{ n: string }> }) {
  const n = Number((await params).n);
  const c = Number.isInteger(n) ? getCase(n) : null;
  if (!c) return new Response("No such case.", { status: 404 });
  const rows = [
    ["case", "n", "at", "kind", "ref", "wallet", "amount", "note", "explorer"],
    ...c.evidence.map((e, i) => [
      c.id,
      i + 1,
      e.at,
      e.kind,
      e.ref,
      e.wallet ?? "",
      e.amount ?? "",
      e.note,
      e.ref === "hidden" ? "" : e.kind === "tx" ? `https://solscan.io/tx/${e.ref}` : `https://solscan.io/account/${e.ref}`,
    ]),
  ];
  const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="crime-case-${c.id}-evidence.csv"`,
      "cache-control": "no-store",
    },
  });
}
