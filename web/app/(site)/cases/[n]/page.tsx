import type { Metadata } from "next";
import { dyn } from "@/lib/request";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCase, cardUrl, neighbours } from "@/lib/data";
import { apiUrl, withBase } from "@/lib/dyn";
import { Stamp } from "@/components/Stamp";
import { date, time, siteUrl, solscanToken } from "@/lib/format";
import { Severity } from "@/components/Pills";
import { EvidenceTable } from "@/components/Evidence";
import { MoneyTrail } from "@/components/MoneyTrail";

type Props = { params: Promise<{ n: string }> };


function parseN(s: string): number | null {
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await dyn();
  const n = parseN((await params).n);
  const c = n ? getCase(n) : null;
  if (!c) return { title: "No such case" };
  const img = `${siteUrl()}${cardUrl(c.n)}`;
  return {
    title: `Case ${c.id}`,
    description: c.headline,
    openGraph: { title: `C.R.I.M.E. case ${c.id}`, description: c.headline, images: [{ url: img, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: `C.R.I.M.E. case ${c.id}`, description: c.headline, images: [img] },
  };
}

export default async function CasePage({ params }: Props) {
  await dyn();
  const n = parseN((await params).n);
  const c = n ? getCase(n) : null;
  if (!c) notFound();
  const { prev, next } = neighbours(c.n);

  return (
    <article className="flex flex-col gap-8">
      <nav aria-label="Case navigation" className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em]">
        {next ? <Link href={`/cases/${next.n}`} className="underline">Newer · No. {next.id}</Link> : <span />}
        <Link href="/cases" className="text-mute hover:text-manila">Archive</Link>
        {prev ? <Link href={`/cases/${prev.n}`} className="underline">Older · No. {prev.id}</Link> : <span />}
      </nav>
      <div className="file">
        <Image src={withBase(cardUrl(c.n))} alt={`Case file ${c.id}: ${c.headline}`} width={1200} height={630} priority unoptimized className="block w-full h-auto" />
      </div>

      <div className="file p-5 md:p-8 overflow-hidden">
        <div className="absolute! right-6 bottom-16 md:right-10 md:bottom-20 hidden sm:block" aria-hidden>
          <Stamp size={64} />
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b-2 border-ink pb-3">
          <span className="headline text-xl">C.R.I.M.E.</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">
            Case file No. {c.id} · {c.status}
          </span>
        </div>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 text-[13px]">
          <div>
            <dt className="label">Opened</dt>
            <dd>
              {date(c.opened_at)} {time(c.opened_at)}
            </dd>
          </div>
          <div>
            <dt className="label">Token</dt>
            <dd>
              ${c.token.symbol} · {c.token.name}
            </dd>
          </div>
          <div>
            <dt className="label">Subject</dt>
            <dd className="flex flex-wrap gap-x-3">
              {c.subjects.length === 0 ? <span className="opacity-70">no handle on record</span> : null}
              {c.subjects.map((s) => (
                <Link key={s} href={`/persons/${s.slice(1)}`} className="underline">
                  {s}
                </Link>
              ))}
            </dd>
          </div>
          <div>
            <dt className="label">Severity</dt>
            <dd>
              <Severity level={c.severity} ink /> · score {c.score}
            </dd>
          </div>
          <div className="col-span-2 md:col-span-4">
            <dt className="label">CA</dt>
            <dd className="break-all">
              <a href={solscanToken(c.token.mint)} target="_blank" rel="noopener noreferrer" className="underline">
                {c.token.mint}
              </a>
              <span className="ml-3 text-[11px] font-semibold uppercase tracking-[0.12em] whitespace-nowrap">
                <a href={`https://dexscreener.com/solana/${c.token.mint}`} target="_blank" rel="noopener noreferrer" className="underline">
                  Chart
                </a>
                {/pump$/.test(c.token.mint) ? (
                  <>
                    {" · "}
                    <a href={`https://pump.fun/coin/${c.token.mint}`} target="_blank" rel="noopener noreferrer" className="underline">
                      pump.fun
                    </a>
                  </>
                ) : null}
              </span>
            </dd>
          </div>
        </dl>

        <h1 className="mt-8 text-3xl md:text-4xl max-w-3xl">{c.headline}</h1>
        <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.14em]">{c.charge}</p>

        <h2 className="mt-10 text-xl">Findings</h2>
        <ol className="mt-3 flex flex-col gap-3">
          {c.findings.map((f) => (
            <li key={f.code} className="grid grid-cols-[72px_1fr] gap-3 text-[13px]">
              <span className="font-semibold text-stamp">{f.code}</span>
              <div>
                <div className="font-semibold">{f.title}</div>
                <div className="opacity-80">{f.detail}</div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex items-baseline justify-between gap-4">
          <h2 className="text-xl">Evidence</h2>
          <a href={withBase(`/cases/${c.n}/evidence.csv`)} className="text-[11px] font-semibold uppercase tracking-[0.14em] underline" download>
            Download CSV
          </a>
        </div>
        <div className="mt-3">
          <EvidenceTable rows={c.evidence} />
        </div>

        <h2 className="mt-10 text-xl">Money trail</h2>
        <div className="mt-3">
          <MoneyTrail hops={c.money_trail} />
        </div>

        <h2 className="mt-10 text-xl">Narrative</h2>
        <div className="mt-3 flex flex-col gap-3 max-w-3xl text-[14px] leading-relaxed">
          {c.narrative.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap justify-between gap-4 border-t border-ink pt-4 text-[11px] font-semibold uppercase tracking-[0.12em]">
          <span>
            <a href={apiUrl(`/api/cases/${c.n}`)} className="underline">
              JSON
            </a>{" "}
            ·{" "}
            <a href={withBase(cardUrl(c.n))} className="underline" download={`crime-case-${c.id}.png`}>
              PNG
            </a>{" "}
            ·{" "}
            <Link href="/rules#dispute" className="underline">
              Dispute
            </Link>{" "}
            ·{" "}
            <a
              href={`https://x.com/intent/post?text=${encodeURIComponent(`${c.headline}\n\nC.R.I.M.E. case ${c.id}. Convictions: 0.`)}&url=${encodeURIComponent(`${siteUrl()}/cases/${c.n}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Post
            </a>
          </span>
          <span className="text-stamp">Convictions 0</span>
        </div>
      </div>
    </article>
  );
}
