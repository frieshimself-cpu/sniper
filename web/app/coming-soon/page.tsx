import type { Metadata } from "next";
import { Stamp } from "@/components/Stamp";
import { Board } from "@/components/Board";

export const metadata: Metadata = {
  title: "C.R.I.M.E.",
  description: "Chain Research & Investigation of Market Exploits. Cases opened soon. Convictions: 0.",
};

/** The curtain. What a visitor sees on the real domain until the release. */
export default function ComingSoon() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden">
      <Board className="absolute inset-0 w-full h-full opacity-70" />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 60% at 50% 45%, transparent 20%, rgba(7,7,8,0.9) 100%)" }} aria-hidden />
      <main className="relative flex-1 flex flex-col items-center justify-center text-center px-6 py-16">
        <Stamp size={72} blend={false} />
        <h1 className="abr abr-live mt-12 text-5xl sm:text-7xl md:text-8xl tracking-[0.2em]">C.R.I.M.E.</h1>
        <p className="label label-dark mt-6">Chain Research &amp; Investigation of Market Exploits</p>
        <p className="mt-10 max-w-md text-[13px] leading-relaxed text-mute">
          Every hour the public picks a handle. The agent reads the record, every post, every wallet, and opens a case when the chain disagrees
          with the feed. Every claim is a link. Nothing is a verdict.
        </p>
        <dl className="mt-12 grid grid-cols-3 gap-8 text-left">
          <div>
            <dt className="label label-dark">Cases</dt>
            <dd className="abr text-3xl sm:text-4xl font-semibold leading-none mt-1">soon</dd>
          </div>
          <div>
            <dt className="label label-dark">Ballots</dt>
            <dd className="abr text-3xl sm:text-4xl font-semibold leading-none mt-1">hourly</dd>
          </div>
          <div>
            <dt className="label label-dark">Convictions</dt>
            <dd className="text-stamp abr-soft text-3xl sm:text-4xl font-semibold leading-none mt-1">0</dd>
          </div>
        </dl>
        <a href="https://x.com/crimeislegalpf" target="_blank" rel="noopener noreferrer" className="btn mt-14">
          Follow the file on X
        </a>
      </main>
      <footer className="relative border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-5 flex flex-wrap gap-x-6 gap-y-2 justify-between text-[11px] uppercase tracking-[0.14em] text-mute">
          <span>C.R.I.M.E.</span>
          <span>
            Convictions <span className="text-stamp font-semibold">0</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
