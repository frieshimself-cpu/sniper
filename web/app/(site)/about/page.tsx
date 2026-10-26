import type { Metadata } from "next";
import Link from "next/link";
import { dyn } from "@/lib/request";
import { getStats, latestCases } from "@/lib/data";
import { siteUrl } from "@/lib/format";
import { Stamp } from "@/components/Stamp";

export async function generateMetadata(): Promise<Metadata> {
  await dyn();
  const latest = latestCases(1)[0];
  const description = "A filing clerk with a stamp. Once an hour it takes a name the crowd voted for and writes the case file.";
  const img = latest ? `${siteUrl()}/cases/${latest.n}/card.png` : undefined;
  return {
    title: "About",
    description,
    openGraph: { title: "C.R.I.M.E. opens a case every hour. You pick who.", description, images: img ? [{ url: img, width: 1200, height: 630 }] : [] },
    twitter: { card: "summary_large_image", title: "C.R.I.M.E. opens a case every hour. You pick who.", description, images: img ? [img] : [] },
  };
}

const STEPS = [
  ["The poll.", "A human posts it on the X account: up to four handles, ten minutes. The public votes there."],
  ["The winner.", "The agent reads the result. It never writes to X. No votes, nothing opened."],
  ["Sweep.", "The winner's post history comes down. Every token mentioned, every \"not selling\", every address they ever typed."],
  ["Map.", "Wallets the handle posted themselves are theirs, claimed. Wallets a public label ties to them are probable. Anything weaker waits for a human."],
  ["Replay.", "The wallets' trades go next to the posts. Bought at 14:02. Posted \"generational entry\" at 14:09. Sold into you at 14:31."],
  ["File.", "Worst thing first. The file is here, every receipt a link."],
];

const FINDINGS = [
  "A token they promoted that was pulled, dumped or bundled.",
  "A buy before the shill and a sell into the followers.",
  "\"LP locked\" while the LP was leaving.",
  "\"Still holding\" after the wallet emptied.",
  "A wallet they claimed that funded a bundle.",
  "A deleted post, when the chain remembers what it said.",
];

export default async function About() {
  await dyn();
  const stats = getStats();
  return (
    <article className="max-w-3xl flex flex-col gap-8">
      <div className="relative">
        <div className="absolute right-0 -top-2 hidden sm:block" aria-hidden>
          <Stamp size={44} blend={false} />
        </div>
        <p className="label label-dark mb-4">Chain Research &amp; Investigation of Market Exploits</p>
        <h1 className="text-4xl md:text-5xl md:pr-40">C.R.I.M.E. opens a case every hour. You pick who.</h1>
        <p className="mt-4 text-sm text-mute">
          It has opened {stats.cases_opened} cases. It has secured zero convictions. It is not a court.
        </p>
      </div>

      <div className="file p-5 md:p-8 flex flex-col gap-8 text-[14px] leading-relaxed">
        <section>
          <h2 className="text-xl">What it is</h2>
          <p className="mt-2">
            A filing clerk with a stamp. Once an hour it takes a name the crowd voted for, reads everything that name ever said on X, finds every
            wallet that name can be tied to, and replays what those wallets did on Solana while the posts were going up. Then it writes the case
            file and posts it.
          </p>
          <p className="mt-2">
            The file has a headline, the findings, the receipts, the money trail and a narrative. Every receipt is a link: a post, a transaction, a
            wallet. If it cannot be linked, it is not in the file.
          </p>
        </section>

        <section>
          <h2 className="text-xl">How a case gets made</h2>
          <ol className="mt-3 flex flex-col gap-2">
            {STEPS.map(([k, v], i) => (
              <li key={k} className="grid grid-cols-[32px_1fr] gap-2">
                <span className="font-semibold text-stamp">{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <span className="font-semibold">{k}</span> {v}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="text-xl">What counts as a finding</h2>
          <ul className="mt-3 flex flex-col gap-1 list-disc pl-5">
            {FINDINGS.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="mt-3">Each one carries a score. Severity measures how much money moved and how clearly. Not guilt.</p>
        </section>

        <section>
          <h2 className="text-xl">The rules</h2>
          <p className="mt-2">
            Handles only. Never a legal name, a face, a city, an employer, a phone number. The agent reads public posts and public ledgers and
            stops there. If a source contains a personal detail, the source is dropped.
          </p>
          <p className="mt-2">A wallet is shown next to a handle only with a link a reader can open. No source, no attribution.</p>
          <p className="mt-2">
            Anyone who controls a wallet can dispute it by signing a message with it. The wallet disappears from every page at once. Not greyed.
            Gone. The reply is: Noted.
          </p>
          <p className="mt-2">The agent reports what it found. It does not say what a court would say. One particular word never appears on this site.</p>
          <p className="mt-2 font-semibold">Convictions: 0. Always. It is the joke and it is also true.</p>
        </section>

        <section>
          <h2 className="text-xl">Why</h2>
          <p className="mt-2">
            Every week someone with a hundred thousand followers calls a coin a generational entry and sells it nine minutes later. The posts stay
            up. The wallet is public. Nobody puts the two side by side. This does, on a schedule, with the receipts attached, for whoever you vote
            for.
          </p>
        </section>

        <section className="border-t-2 border-ink pt-6 text-[12px] font-semibold uppercase tracking-[0.12em] flex flex-wrap gap-x-6 gap-y-2">
          <a href="https://x.com/crimeislegalpf" target="_blank" rel="noopener noreferrer" className="underline">
            The poll
          </a>
          <Link href="/cases" className="underline">
            Cases
          </Link>
          <Link href="/rules" className="underline">
            Rules and disputes
          </Link>
          <span className="ml-auto text-stamp">Convictions 0</span>
        </section>
      </div>
    </article>
  );
}
