import type { Metadata } from "next";
import { dyn } from "@/lib/request";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPerson } from "@/lib/data";
import { normalizeHandle } from "@/lib/policy";
import { date, short, solscanAccount, solscanToken } from "@/lib/format";
import { Severity } from "@/components/Pills";
import { CaseCard } from "@/components/CaseCard";
import { DisputeButton } from "@/components/DisputeButton";
import { WalletGraph } from "@/components/WalletGraph";
import { caseGraph } from "@/lib/graph";

type Props = { params: Promise<{ handle: string }> };

function mergeGraphs(gs: ReturnType<typeof caseGraph>[]): ReturnType<typeof caseGraph> {
  const nodes = new Map<string, ReturnType<typeof caseGraph>["nodes"][number]>();
  const edges: ReturnType<typeof caseGraph>["edges"] = [];
  for (const g of gs) {
    for (const n of g.nodes) {
      const cur = nodes.get(n.id);
      if (cur) cur.weight += n.weight;
      else nodes.set(n.id, { ...n });
    }
    edges.push(...g.edges);
  }
  return { nodes: [...nodes.values()], edges };
}


export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await dyn();
  const h = normalizeHandle(decodeURIComponent((await params).handle));
  return { title: `Dossier ${h}` };
}

export default async function Person({ params }: Props) {
  await dyn();
  const h = normalizeHandle(decodeURIComponent((await params).handle));
  const p = getPerson(h);
  if (!p) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="file p-5 md:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b-2 border-ink pb-3">
          <span className="headline text-xl">C.R.I.M.E.</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">Dossier</span>
        </div>
        <h1 className="mt-6 text-4xl md:text-5xl break-all">{p.handle}</h1>
        {p.note ? <p className="mt-2 text-sm opacity-80">{p.note}</p> : null}
        <dl className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          {(
            [
              ["Cases", p.cases],
              ["Findings", p.findings],
              ["Wallets on record", p.walletsOnRecord.length],
              ["Convictions", 0],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="label">{k}</dt>
              <dd className={`text-3xl font-semibold ${k === "Convictions" ? "text-stamp" : ""}`}>{v}</dd>
            </div>
          ))}
        </dl>
        {p.topSeverity ? (
          <p className="mt-4 text-[12px]">
            <span className="label mr-2">Top severity</span>
            <Severity level={p.topSeverity} ink />
          </p>
        ) : null}

        <h2 className="mt-10 text-xl">Wallets on the record</h2>
        <p className="mt-1 text-xs opacity-70">Listed only when the registry carries a source. A disputed wallet is removed.</p>
        {p.walletsOnRecord.length === 0 ? (
          <p className="mt-3 text-sm">None.</p>
        ) : (
          <div className="mt-3 overflow-x-auto -mx-5 px-5">
            <table className="data">
              <thead>
                <tr>
                  <th>Wallet</th>
                  <th>Tier</th>
                  <th>Source</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {p.walletsOnRecord.map((w) => (
                  <tr key={w.address}>
                    <td>
                      <a href={solscanAccount(w.address)} target="_blank" rel="noopener noreferrer" className="underline">
                        {short(w.address, 6)}
                      </a>
                    </td>
                    <td className="uppercase font-semibold">{w.tier}</td>
                    <td>
                      <a href={w.source} target="_blank" rel="noopener noreferrer" className="underline">
                        {w.source.replace(/^https?:\/\//, "").slice(0, 40)}
                      </a>
                    </td>
                    <td>
                      <DisputeButton wallet={w.address} small />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {p.caseList.length ? (
          <>
            <h2 className="mt-10 text-xl">The money</h2>
            <p className="mt-1 text-xs opacity-70">Every wallet in this handle&apos;s cases, and where the money went. Hover to trace, click to open.</p>
            <div className="mt-3 -mx-5 md:-mx-8 border-y-2 border-ink bg-page text-manila p-2 md:p-3">
              <WalletGraph graph={mergeGraphs(p.caseList.map(caseGraph))} />
            </div>
          </>
        ) : null}

        <h2 className="mt-10 text-xl">Tokens</h2>
        {p.tokens.length === 0 ? (
          <p className="mt-3 text-sm">None.</p>
        ) : (
          <div className="mt-3 overflow-x-auto -mx-5 px-5">
            <table className="data">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>CA</th>
                  <th>Case</th>
                  <th>Severity</th>
                  <th>Opened</th>
                </tr>
              </thead>
              <tbody>
                {p.tokens.map((t) => (
                  <tr key={t.caseN}>
                    <td className="font-semibold">
                      ${t.symbol} <span className="font-normal opacity-70">{t.name}</span>
                    </td>
                    <td>
                      <a href={solscanToken(t.mint)} target="_blank" rel="noopener noreferrer" className="underline">
                        {short(t.mint, 6)}
                      </a>
                    </td>
                    <td>
                      <Link href={`/cases/${t.caseN}`} className="underline">
                        No. {t.caseId}
                      </Link>
                    </td>
                    <td>
                      <Severity level={t.severity} ink />
                    </td>
                    <td>{date(t.opened_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-8 text-xs opacity-70">
          To dispute a wallet, press Dispute and sign <code>CRIME dispute &lt;wallet&gt;</code> with it. It is hidden at once.{" "}
          <Link href="/rules#dispute" className="underline">
            How disputes work
          </Link>
          .
        </p>
      </div>

      {p.caseList.length ? (
        <section>
          <h2 className="text-2xl mb-4">Cases</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {p.caseList.map((c) => (
              <CaseCard key={c.n} c={c} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
