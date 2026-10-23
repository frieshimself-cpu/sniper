import Link from "next/link";
import { getStats, latestCases } from "@/lib/data";
import { ensureTodayBallot } from "@/lib/ballot";
import { tally } from "@/lib/store";
import { rpcStatus } from "@/lib/solana";
import { ago } from "@/lib/format";
import { Counter } from "@/components/Counter";
import { Pill } from "@/components/Pills";
import { CaseCard } from "@/components/CaseCard";
import { BallotVote } from "@/components/BallotVote";
import { Stamp } from "@/components/Stamp";

export default function Home() {
  const stats = getStats();
  const ballot = ensureTodayBallot();
  const t = ballot ? tally(ballot) : {};
  const total = Object.values(t).reduce((a, b) => a + b, 0);
  const rpc = rpcStatus();
  const latest = latestCases(6);

  return (
    <div className="flex flex-col gap-12 md:gap-16">
      <section className="relative">
        <div className="absolute right-0 -top-2 hidden md:block" aria-hidden>
          <Stamp size={56} blend={false} />
        </div>
        <p className="label label-dark mb-6">Chain Research &amp; Investigation of Market Exploits</p>
        <Counter initial={stats} />
        <div className="mt-8 flex flex-wrap gap-2">
          <Pill>Agent watching</Pill>
          <Pill red={rpc === "unset"}>RPC {rpc === "ok" ? "ok" : rpc === "off" ? "check off" : "unset"}</Pill>
          <Pill>Last case {ago(stats.last_case_at)}</Pill>
          <Pill>Ballot {ballot ? "open" : "closed"}</Pill>
          <Pill red>Convictions 0</Pill>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-5">
        <div className="file p-5 lg:col-span-2 self-start">
          <h2 className="text-2xl">Today&apos;s ballot</h2>
          <p className="mt-1 mb-5 text-xs opacity-70">Four subjects. One wallet, one vote. The winner is the next case.</p>
          <BallotVote initial={{ ballot, tally: t, total }} compact />
          <Link href="/ballot" className="mt-5 inline-block text-[11px] font-semibold uppercase tracking-[0.14em] underline">
            Full ballot and history
          </Link>
        </div>
        <div className="lg:col-span-3">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-2xl">Latest cases</h2>
            <Link href="/cases" className="text-[11px] font-semibold uppercase tracking-[0.14em] underline">
              Archive
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {latest.map((c) => (
              <CaseCard key={c.n} c={c} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
