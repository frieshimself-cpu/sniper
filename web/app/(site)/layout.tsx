import Link from "next/link";
import { NavLink } from "@/components/NavLink";
import { apiUrl, withBase } from "@/lib/dyn";
import { getStats, getAgentStatus, latestCases } from "@/lib/data";
import { Marquee } from "@/components/Marquee";
import { until } from "@/lib/format";
import { dyn } from "@/lib/request";

const NAV = [
  ["/#exposed", "exposed"],
  ["/cases", "files"],
  ["/#how", "how it works"],
  ["/rules", "rules"],
  ["/about", "about"],
] as const;

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  await dyn();
  const stats = getStats();
  const agent = getAgentStatus();
  return (
    <div className="min-h-screen flex flex-col">
      <div className="border-b border-line bg-black/40">
        <div className="mx-auto max-w-6xl px-4 py-1.5 ticker flex flex-wrap gap-x-5 gap-y-0.5">
          <span>
            cases <b>{stats.cases_opened}</b>
          </span>
          <span>
            crimes found <b>{stats.crimes_found}</b>
          </span>
          <span>
            convictions <b className="red">0</b>
          </span>
          <span className="ml-auto hidden sm:inline">
            agent <b>{agent.state === "idle" ? "watching" : agent.state}</b>
            {agent.next_run_at ? (
              <>
                {" "}· next case <b>{until(agent.next_run_at)}</b>
              </>
            ) : null}
          </span>
        </div>
      </div>
      <header className="border-b border-line sticky top-0 z-20 backdrop-blur bg-page/80">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:h-14 sm:py-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-4 gap-y-2">
          <Link href="/" className="flex items-center gap-3 no-underline">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={withBase("/brand/knife.png")} alt="" className="logo-knife" width={30} height={30} />
            <span className="headline abr text-base tracking-[0.18em]">CRIME IS LEGAL</span>
          </Link>
          <nav aria-label="Primary" className="w-full sm:w-auto -mx-2 sm:mx-0 flex flex-wrap gap-x-1 gap-y-1 text-[12px] tracking-[0.08em] whitespace-nowrap">
            {NAV.map(([href, label]) => (
              <NavLink key={href} href={href}>
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <Marquee
        items={[
          `${stats.cases_opened} cases opened`,
          `${stats.crimes_found} crimes found`,
          "convictions 0",
          ...latestCases(6).map((c) => `No. ${c.id} · ${c.headline}`),
          `agent ${agent.state === "idle" ? "watching" : agent.state}`,
        ]}
      />
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8 md:py-12">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-6 flex flex-wrap gap-x-6 gap-y-2 justify-between text-[11px] uppercase tracking-[0.14em] text-mute">
          <span>C.R.I.M.E. · Chain Research &amp; Investigation of Market Exploits</span>
          <span>
            Convictions <span className="text-stamp font-semibold">0</span> · <Link href="/rules" className="hover:text-manila">Rules</Link> · <a href={apiUrl("/api/stats")} className="hover:text-manila">API</a> · <a href={withBase("/feed.xml")} className="hover:text-manila">Feed</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
