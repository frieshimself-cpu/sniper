import type { Metadata } from "next";
import { dyn } from "@/lib/request";
import Link from "next/link";
import { getStats, latestCases, getAgentStatus } from "@/lib/data";
import { ensureCurrentBallot } from "@/lib/ballot";
import { tally } from "@/lib/store";
import { getBoard } from "@/lib/nominations";
import { ago, until, siteUrl } from "@/lib/format";
import { Counter } from "@/components/Counter";
import { Pill } from "@/components/Pills";
import { CaseCard } from "@/components/CaseCard";
import { Board } from "@/components/Board";
import { Glitch } from "@/components/Glitch";
import { Exposed } from "@/components/Exposed";
import { Nominate } from "@/components/Nominate";
import { withBase } from "@/lib/dyn";

export async function generateMetadata(): Promise<Metadata> {
  await dyn();
  const stats = getStats();
  const description = `${stats.cases_opened} cases opened. ${stats.crimes_found} crimes found. Convictions: 0.`;
  const img = `${siteUrl()}/brand/og.jpg`;
  return {
    description,
    openGraph: { description, images: [{ url: img, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", description, images: [img] },
  };
}

export default async function Home() {
  await dyn();
  const stats = getStats();
  const ballot = await ensureCurrentBallot();
  const t = ballot ? tally(ballot) : {};
  const total = Object.values(t).reduce((a, b) => a + b, 0);
  const latest = latestCases(3);
  const agent = getAgentStatus();
  const board = (await getBoard()).slice(0, 6);
  const last = latest[0];
  const lastSubject = last ? (last.kind === "person" && last.subjects[0] ? { label: last.subjects[0], href: `/cases/${last.n}` } : { label: `$${last.token.symbol}`, href: `/cases/${last.n}` }) : null;

  return (
    <div className="flex flex-col gap-20 md:gap-28">
      {/* ---- the hero ---------------------------------------------------------------- */}
      <section className="relative -mx-4 px-4 pt-6 pb-10 md:pt-10 md:pb-16 overflow-hidden">
        <Board className="absolute inset-0 w-full h-full opacity-70" />
        <div className="relative grid gap-8 md:grid-cols-[1fr_minmax(220px,340px)] md:items-center">
          <div className="min-w-0">
            <Glitch src={withBase("/brand/wordmark.png")} alt="CRIME IS LEGAL" width={1502} height={392} priority className="w-full max-w-[680px]" />
            <p className="mt-6 max-w-xl text-[13px] text-mute leading-relaxed">
              Every hour the public picks a handle. The agent reads the whole record, every post, every wallet, and opens a case when the chain
              disagrees with the feed. Every claim is a link. Nothing is a verdict.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Pill red={agent.state === "error"}>Agent {agent.state === "idle" ? "watching" : agent.state}</Pill>
              {agent.next_run_at ? <Pill>Next case {until(agent.next_run_at)}</Pill> : null}
              <Pill>Last case {ago(stats.last_case_at)}</Pill>
              <Pill red>Convictions 0</Pill>
            </div>
          </div>
          <Glitch src={withBase("/brand/knife.png")} alt="" width={1408} height={1408} priority className="w-[200px] sm:w-[260px] md:w-full justify-self-end" />
        </div>
        <div className="relative mt-10 md:mt-14">
          <Counter initial={stats} compact />
        </div>
      </section>

      {/* ---- who gets exposed first -------------------------------------------------- */}
      <section id="exposed" className="scroll-mt-20">
        <h2 className="text-2xl md:text-3xl">Who gets exposed first</h2>
        <p className="mt-1 mb-8 text-[13px] text-mute">Four names an hour. Ten minutes to vote. The winner gets read, wallet by wallet, post by post.</p>
        <Exposed initial={{ ballot, tally: t, total }} lastSubject={lastSubject} />
      </section>

      {/* ---- the latest files -------------------------------------------------------- */}
      <section id="files" className="scroll-mt-20">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-2xl md:text-3xl">Latest files</h2>
          <Link href="/cases" className="text-[11px] font-semibold uppercase tracking-[0.14em] underline">
            All {stats.cases_opened} cases
          </Link>
        </div>
        {latest.length === 0 ? (
          <p className="text-mute">No cases yet. The agent is watching.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {latest.map((c) => (
              <CaseCard key={c.n} c={c} />
            ))}
          </div>
        )}
      </section>

      {/* ---- how it works ------------------------------------------------------------ */}
      <section id="how" className="scroll-mt-20">
        <h2 className="text-2xl md:text-3xl">How it works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            ["01", "Nominate", "Sign a message with your wallet. The four most nominated handles go on the hour's ballot."],
            ["02", "Vote", "A poll on X, ten minutes. The winner is the subject. No votes, no case."],
            ["03", "Exposed", "Every post read by Grok, every wallet from Arkham replayed on chain through Helius. Posts next to transactions, by time. Findings scored. A case opens only when the evidence clears the bar."],
          ].map(([n, title, body]) => (
            <li key={n} className="file p-5">
              <span className="text-stamp font-semibold text-[11px] tracking-[0.14em]">{n}</span>
              <h3 className="mt-2 text-xl">{title}</h3>
              <p className="mt-2 text-[13px] opacity-80 leading-relaxed">{body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-[12px] text-mute max-w-2xl">
          Handles only. A wallet is attributed only with a linked source. Disputed wallets vanish. The agent finds things; courts decide what they are.{" "}
          <Link href="/rules" className="underline">
            The rules
          </Link>
          .
        </p>
      </section>

      {/* ---- nominate ---------------------------------------------------------------- */}
      <section id="nominate" className="scroll-mt-20 grid gap-8 md:grid-cols-2">
        <div className="file p-5">
          <h2 className="text-2xl">Put a name on the block</h2>
          <p className="mt-1 mb-5 text-[13px] opacity-70">One signature. Nothing on chain. One nomination per wallet per handle per day.</p>
          <Nominate />
        </div>
        <div className="file p-5">
          <div className="flex items-baseline justify-between border-b border-ink/40 pb-2">
            <h2 className="text-2xl">The board</h2>
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">{board.length} handle{board.length === 1 ? "" : "s"}</span>
          </div>
          {board.length === 0 ? (
            <p className="mt-4">The board is empty. Be first.</p>
          ) : (
            <ol className="mt-4 flex flex-col gap-2">
              {board.map((b, i) => (
                <li key={b.handle} className="flex items-baseline justify-between gap-3">
                  <span>
                    <span className="font-semibold text-xs mr-2 opacity-70">{String(i + 1).padStart(2, "0")}</span>
                    {b.handle}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">{b.nominations} nomination{b.nominations === 1 ? "" : "s"}</span>
                </li>
              ))}
            </ol>
          )}
          <Link href="/nominate" className="mt-5 inline-block text-[11px] font-semibold uppercase tracking-[0.14em] underline">
            The whole board
          </Link>
        </div>
      </section>
    </div>
  );
}
