"use client";

/**
 * Who gets exposed first. The poll a human posted on the account, read live from X: the leader written
 * large, the names under it with their votes, the way to the poll while it is open, the case once it settled.
 * Nothing here can vote or post; it reads.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiUrl } from "@/lib/dyn";
import type { PollView } from "@/lib/polls";
import { GlitchText } from "./GlitchText";

function left(iso: string) {
  const s = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 1000));
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 120 ? `${m}m` : `${Math.round(m / 60)}h`;
}

const hrefFor = (subject: string | undefined, known: string[]) => (subject?.startsWith("@") && known.includes(subject.toLowerCase()) ? `/persons/${subject.slice(1)}` : null);

export function Exposed({ initial, account, lastSubject, known = [] }: { initial: PollView | null; account: string; lastSubject: { label: string; href: string } | null; known?: string[] }) {
  const [poll, setPoll] = useState<PollView | null>(initial);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch(apiUrl("/api/poll"), { cache: "no-store" });
        if (r.ok) setPoll(((await r.json()) as { poll: PollView | null }).poll);
      } catch {
        /* keep */
      }
      tick((n) => n + 1);
    }, 20_000);
    return () => clearInterval(id);
  }, []);

  if (!poll) {
    return (
      <div>
        <p className="label label-dark">No poll on the block right now</p>
        <p className="mt-3 text-[13px] text-mute">
          The next one goes up on{" "}
          <a href={`https://x.com/${account}`} target="_blank" rel="noopener noreferrer" className="underline text-manila">
            @{account}
          </a>
          . Four names, ten minutes.
        </p>
        {lastSubject ? (
          <>
            <p className="label label-dark mt-10">Last exposed</p>
            <Link href={lastSubject.href} className="no-underline block mt-2">
              <GlitchText className="text-[44px] sm:text-[72px] md:text-[104px]">{lastSubject.label}</GlitchText>
            </Link>
          </>
        ) : null}
      </div>
    );
  }

  const open = poll.open && Date.parse(poll.closes_at) > Date.now();
  const ordered = [...poll.options].sort((a, b) => b.votes - a.votes);
  const lead = (poll.winner && poll.options.find((o) => o.label === poll.winner)) || ordered[0];
  const n = lead.votes;
  const pct = poll.total ? Math.round((n / poll.total) * 100) : 0;
  const tied = open && ordered.length > 1 && ordered[1].votes === n;
  const href = hrefFor(lead.subject, known);
  const max = Math.max(1, ...poll.options.map((o) => o.votes));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 ticker">
        <span>
          {open ? "the vote is open on X" : poll.case_n ? "settled" : poll.message ? "closed" : "closed · the agent is reading"}
        </span>
        <span>
          {poll.total} vote{poll.total === 1 ? "" : "s"}
          {open ? (
            <>
              {" "}· closes in <b>{left(poll.closes_at)}</b>
            </>
          ) : null}
        </span>
      </div>
      <p className="label label-dark mt-8">{!open ? "Exposed" : poll.total === 0 ? "First on the block" : tied ? "Tied at the top" : "Leading"}</p>
      <div className="mt-2 overflow-hidden">
        {href ? (
          <Link href={href} className="no-underline">
            <GlitchText className="text-[44px] sm:text-[72px] md:text-[104px]">{lead.label}</GlitchText>
          </Link>
        ) : (
          <GlitchText className="text-[44px] sm:text-[72px] md:text-[104px]">{lead.label}</GlitchText>
        )}
      </div>
      <p className="mt-3 text-[13px] text-mute">
        {poll.case_n ? (
          <>
            Investigated.{" "}
            <Link href={`/cases/${poll.case_n}`} className="underline text-manila">
              Read case {String(poll.case_n).padStart(4, "0")}
            </Link>
            .
          </>
        ) : !open && poll.message ? (
          poll.message
        ) : !open ? (
          "Won the poll. The file is being written."
        ) : poll.total === 0 ? (
          "No votes yet. The first vote decides who the agent reads first."
        ) : (
          `${n} vote${n === 1 ? "" : "s"}, ${pct}% so far.`
        )}
      </p>

      <div className="mt-10 file p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink/40 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
          <span>The poll</span>
          <span>{poll.opened_at.slice(0, 16).replace("T", " ")} UTC</span>
        </div>
        <ol className="mt-4 flex flex-col gap-4">
          {poll.options.map((o, i) => {
            const p = poll.total ? Math.round((o.votes / poll.total) * 100) : 0;
            const h = hrefFor(o.subject, known);
            return (
              <li key={i} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="headline text-lg">
                    <span className="font-mono text-xs font-semibold mr-2 opacity-75">{String(i + 1).padStart(2, "0")}</span>
                    {h ? (
                      <Link href={h} className="no-underline">
                        {o.label}
                      </Link>
                    ) : (
                      o.label
                    )}
                    {o.label === lead.label && !open ? <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-stamp">won</span> : null}
                  </span>
                  <span className="text-sm font-semibold">
                    {o.votes} · {p}%
                  </span>
                </div>
                <div className="tally">
                  <span style={{ width: `${(o.votes / max) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-5 flex flex-wrap items-center gap-3 text-xs">
          <a href={poll.url} target="_blank" rel="noopener noreferrer" className={`btn ${open ? "btn-red" : ""}`}>
            {open ? "Vote on X" : "The poll on X"}
          </a>
          <span className="opacity-70">{open ? "Votes are cast in the poll. The count here follows X." : "Closed."}</span>
        </p>
      </div>
    </div>
  );
}
