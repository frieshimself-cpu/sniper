import Link from "next/link";
import { Stamp } from "@/components/Stamp";
import { apiUrl, withBase } from "@/lib/dyn";

const NAV = [
  ["/cases", "Cases"],
  ["/persons", "Persons"],
  ["/ballot", "Ballot"],
  ["/stamp", "Stamp"],
  ["/embed", "Embed"],
  ["/rules", "Rules"],
  ["/about", "About"],
] as const;

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:h-14 sm:py-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-4 gap-y-2">
          <Link href="/" className="flex items-center gap-3 no-underline">
            <Stamp size={13} sub={false} blend={false} />
            <span className="headline text-base tracking-wide">C.R.I.M.E.</span>
          </Link>
          <nav aria-label="Primary" className="w-full sm:w-auto flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="py-1 sm:py-2 hover:text-stamp">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
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
