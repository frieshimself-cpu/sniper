import Link from "next/link";
import type { Case } from "@/lib/types";
import { date } from "@/lib/format";
import { Severity } from "./Pills";

export function CaseCard({ c }: { c: Case }) {
  return (
    <Link href={`/cases/${c.n}`} className="file block p-5 no-underline hover:outline hover:outline-2 hover:outline-manila">
      <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-2">
        <span className="headline text-sm tracking-wide">C.R.I.M.E.</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">No. {c.id}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 pt-3 text-[13px]">
        <div><span className="label block">Opened</span>{date(c.opened_at)}</div>
        <div><span className="label block">Token</span>${c.token.symbol}</div>
        <div><span className="label block">Severity</span><Severity level={c.severity} ink /></div>
      </div>
      <h3 className="mt-4 text-xl leading-tight">{c.headline}</h3>
      <div className="mt-3 flex flex-wrap gap-x-3 text-[11px] font-semibold uppercase tracking-[0.12em]">
        {c.subjects.length === 0 ? <span className="opacity-60">wallets only</span> : null}
        {c.subjects.map((s) => (
          <span key={s}>{s}</span>
        ))}
        <span className="ml-auto">{c.findings.length} findings</span>
      </div>
    </Link>
  );
}
