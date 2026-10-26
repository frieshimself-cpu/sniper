import type { Metadata } from "next";
import { dyn } from "@/lib/request";
import Link from "next/link";
import { getStats, latestCases, getAgentStatus } from "@/lib/data";
import { ensureCurrentBallot } from "@/lib/ballot";
import { tally } from "@/lib/store";
import { rpcStatus } from "@/lib/solana";
import { ago, until, siteUrl } from "@/lib/format";
import { Counter } from "@/components/Counter";
import { Pill } from "@/components/Pills";
import { CaseCard } from "@/components/CaseCard";
import { BallotVote } from "@/components/BallotVote";
import { Stamp } from "@/components/Stamp";
import { Board } from "@/components/Board";
import { STATIC } from "@/lib/dyn";

export async function generateMetadata(): Promise<Metadata> {
  await dyn();
  const latest = latestCases(1)[0];
  const stats = getStats();
  const description = `${stats.cases_opened} cases opened. ${stats.crimes_found} crimes found. Convictions: 0.`;
  const img = latest ? `${siteUrl()}/cases/${latest.n}/card.png` : undefined;
  return {
    description,
    openGraph: { description, images: img ? [{ url: img, width: 1200, height: 630 }] : [] },
    twitter: { card: "summary_large_image", description, images: img ? [img] : [] },
  };
}

export default async function Home() {
  await dyn();
  const stats = getStats();
  const ballot = await ensureCurrentBallot();
  const t = ballot ? tally(ballot) : {};
  const total = Object.values(t).reduce((a, b) => a + b, 0);
  const rpc = rpcStatus();
  const latest = latestCases(6);
  const agent = getAgentStatus();

  return (
    <div className="flex flex-col gap-12 md:gap-16">
      <section className="relative -mx-4 px-4 py-10 md:py-16 overflow-hidden border-b border-line">
        <Board className="absolute inset-0 w-full h-full opacity-80" />
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 70% at 50% 50%, transparent 30%, rgba(7,7,8,0.85) 100%)" }} aria-hidden />
        <div className="absolute right-4 top-5 md:hidden" aria-hidden>
          <Stamp size={16} blend={false} />
        </div>
        <div className="absolute right-8 bottom-10 hidden md:block" aria-hidden>
          <Stamp size={64} blend={false} />
        </div>
        <div className="relative">
          <p className="label label-dark mb-6 pr-28 md:pr-0">Chain Research &amp; Investigation of Market Exploits</p>
          <Counter initial={stats} />
          <p className="mt-8 max-w-xl text-[13px] text-mute leading-relaxed">
            Every hour the public picks a handle. The agent reads the whole record, every post, every wallet, and opens a case when the chain
            disagrees with the feed. Every claim is a link. Nothing is a verdict.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Pill red={agent.state === "error"}>Agent {agent.state === "idle" ? "watching" : agent.state}</Pill>
            {agent.next_run_at ? <Pill>Next case {until(agent.next_run_at)}</Pill> : null}
            {STATIC ? <Pill>Read-only copy</Pill> : <Pill red={rpc === "unset"}>RPC {rpc === "ok" ? "ok" : rpc === "off" ? "check off" : "unset"}</Pill>}
            <Pill>Last case {ago(stats.last_case_at)}</Pill>
            <Pill>Ballot {ballot ? "open" : "closed"}</Pill>
            <Pill red>Convictions 0</Pill>
          </div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-5">
        <div className="file p-5 lg:col-span-2 self-start">
          <h2 className="text-2xl">This hour&apos;s ballot</h2>
          <p className="mt-1 mb-5 text-xs opacity-70">Up to four subjects. Ten minutes to vote. The winner is the next case.</p>
          <BallotVote initial={{ ballot, tally: t, total }} compact />
          <div className="mt-5 flex flex-wrap gap-x-5 text-[11px] font-semibold uppercase tracking-[0.14em]">
            <Link href="/ballot" className="underline">
              Full ballot and history
            </Link>
            <Link href="/nominate" className="underline">
              Nominate a handle
            </Link>
          </div>
        </div>
        <div className="lg:col-span-3">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-2xl">Latest cases</h2>
            <Link href="/cases" className="text-[11px] font-semibold uppercase tracking-[0.14em] underline">
              Archive
            </Link>
          </div>
          {latest.length === 0 ? (
            <p className="text-mute">No cases yet. The agent is watching.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {latest.map((c) => (
                <CaseCard key={c.n} c={c} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
