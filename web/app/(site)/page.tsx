import type { Metadata } from "next";
import { dyn } from "@/lib/request";
import Link from "next/link";
import { getStats, latestCases, getAgentStatus, getPersons } from "@/lib/data";
import { currentPoll } from "@/lib/polls";
import { getProgress } from "@/lib/progress";
import { ago, until, siteUrl } from "@/lib/format";
import { Counter } from "@/components/Counter";
import { Pill } from "@/components/Pills";
import { CaseCard } from "@/components/CaseCard";
import { Board } from "@/components/Board";
import { Glitch } from "@/components/Glitch";
import { Exposed } from "@/components/Exposed";
import { Live } from "@/components/Live";
import { Hero } from "@/components/Hero";
import { Reveal } from "@/components/Reveal";
import { Pipeline } from "@/components/Pipeline";
import { WalletGraph } from "@/components/WalletGraph";
import { Stamp } from "@/components/Stamp";
import { caseGraph } from "@/lib/graph";
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

function Chapter({ n, title, sub, id }: { n: string; title: string; sub?: string; id: string }) {
  return (
    <div id={id} className="chapter scroll-mt-24">
      <span className="chapter-n">{n}</span>
      <h2>{title}</h2>
      {sub ? <p className="chapter-sub">{sub}</p> : null}
    </div>
  );
}

export default async function Home() {
  await dyn();
  const stats = getStats();
  const poll = await currentPoll();
  const progress = await getProgress();
  const account = (process.env.X_ACCOUNT ?? "crimeislegalpf").replace(/^@/, "");
  const latest = latestCases(6);
  const agent = getAgentStatus();
  const last = latest[0];
  const lastSubject = last ? (last.kind === "person" && last.subjects[0] ? { label: last.subjects[0], href: `/cases/${last.n}` } : { label: `$${last.token.symbol}`, href: `/cases/${last.n}` }) : null;
  const drawn = latest.find((c) => c.money_trail.length > 1) ?? last;

  return (
    <div className="flex flex-col gap-24 md:gap-36">
      {/* ---- the opening frame ------------------------------------------------------- */}
      <section className="relative -mx-4 px-4 overflow-hidden">
        <Board className="absolute inset-0 w-full h-full opacity-60" />
        <div className="relative">
          <Hero line="The public picks a handle. The agent reads everything. Nothing is a verdict.">
            <div className="mt-7 flex flex-wrap gap-2">
              <Pill red={agent.state === "error"}>Agent {agent.state === "idle" ? "watching" : agent.state}</Pill>
              {agent.next_run_at ? <Pill>Next case {until(agent.next_run_at)}</Pill> : null}
              <Pill>Last case {ago(stats.last_case_at)}</Pill>
              <Pill red>Convictions 0</Pill>
            </div>
            <div className="mt-10">
              <Counter initial={stats} compact hero />
            </div>
            <div className="mt-12 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-mute">
              <span className="cue inline-block w-px h-6 bg-mute" aria-hidden />
              <a href="#exposed" className="no-underline hover:text-manila">
                who gets exposed first
              </a>
            </div>
          </Hero>
        </div>
      </section>

      {/* ---- 01 who gets exposed first ----------------------------------------------- */}
      <section>
        <Reveal>
          <Chapter n="01" id="exposed" title="Who gets exposed first" sub={`A poll on @${account}. Four names, ten minutes. The winner gets read, wallet by wallet, post by post.`} />
        </Reveal>
        <Reveal className="mt-10" delay={120}>
          <Exposed initial={poll} account={account} lastSubject={lastSubject} known={getPersons().map((p) => p.handle.toLowerCase())} />
        </Reveal>
      </section>

      {/* ---- 02 the investigation, live ---------------------------------------------- */}
      <section>
        <Reveal>
          <Chapter n="02" id="live" title="Under investigation" sub="The agent's work, step by step, while it does it: the record read, the wallets found, the money replayed, the findings weighed. Nothing here is edited." />
        </Reveal>
        <Reveal className="mt-10" delay={120}>
          <Live initial={progress} account={account} />
        </Reveal>
      </section>

      {/* ---- 03 the files ------------------------------------------------------------ */}
      <section>
        <Reveal>
          <div className="flex items-end justify-between gap-6">
            <Chapter n="03" id="files" title="The files" sub="Every case is a file: a headline, the findings worst first, an evidence table where every row is a link, the money drawn." />
            <Link href="/cases" className="hidden sm:inline text-[11px] font-semibold uppercase tracking-[0.14em] underline whitespace-nowrap">
              All {stats.cases_opened} case{stats.cases_opened === 1 ? "" : "s"}
            </Link>
          </div>
        </Reveal>
        {latest.length === 0 ? (
          <p className="mt-8 text-mute">None yet. The first poll decides who is first.</p>
        ) : (
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {latest.slice(0, 6).map((c, i) => (
              <Reveal key={c.n} delay={i * 80}>
                <div className="relative h-full">
                  <CaseCard c={c} />
                  <span className="card-stamp" aria-hidden>
                    <Stamp size={22} blend={false} sub={false} />
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        )}
        {drawn ? (
          <Reveal className="mt-10" delay={160}>
            <div className="flex items-baseline justify-between gap-4 mb-3">
              <p className="label label-dark">The money, drawn · case {drawn.id}</p>
              <Link href={`/cases/${drawn.n}`} className="text-[11px] font-semibold uppercase tracking-[0.14em] underline">
                Open the file
              </Link>
            </div>
            <div className="border-y border-ink/30 bg-page -mx-4 px-2 md:mx-0 md:px-3 py-2 relative overflow-hidden">
              <WalletGraph graph={caseGraph(drawn)} />
            </div>
          </Reveal>
        ) : null}
        <Link href="/cases" className="sm:hidden mt-6 inline-block text-[11px] font-semibold uppercase tracking-[0.14em] underline">
          All {stats.cases_opened} case{stats.cases_opened === 1 ? "" : "s"}
        </Link>
      </section>

      {/* ---- 04 the method ----------------------------------------------------------- */}
      <section>
        <Reveal>
          <Chapter n="04" id="how" title="How it works" sub="Five stations. The money moves between them. Grok reads, Arkham names, Helius replays, the detectors weigh, the file is written." />
        </Reveal>
        <Reveal className="mt-12" delay={120}>
          <Pipeline />
        </Reveal>
        <Reveal className="mt-8" delay={200}>
          <p className="text-[12px] text-mute max-w-2xl">
            Handles only. A wallet is attributed only with a linked source. Disputed wallets vanish. No verdicts, in any word. The agent finds things; courts decide what they are.{" "}
            <Link href="/rules" className="underline">
              The rules
            </Link>
            .
          </p>
        </Reveal>
      </section>

      {/* ---- the foot ---------------------------------------------------------------- */}
      <section className="pt-6">
        <Reveal>
          <Glitch src={withBase("/brand/wordmark.png")} alt="" width={1502} height={392} className="foot-mark" />
          <p className="mt-6 text-center text-[10px] uppercase tracking-[0.24em] text-mute">Chain Research &amp; Investigation of Market Exploits · Convictions 0</p>
        </Reveal>
      </section>
    </div>
  );
}
