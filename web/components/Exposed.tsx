"use client";

/**
 * Who gets exposed first. The hour's ballot with the leader written large, the rest below it,
 * the vote where the vote is (the poll on X, or signed on the site). Refreshes itself.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiUrl } from "@/lib/dyn";
import type { Ballot } from "@/lib/store";
import { GlitchText } from "./GlitchText";
import { BallotVote } from "./BallotVote";

interface View {
  ballot: Ballot | null;
  tally: Record<string, number>;
  total: number;
}

function left(iso: string) {
  const s = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 1000));
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 120 ? `${m}m` : `${Math.round(m / 60)}h`;
}

export function Exposed({ initial, lastSubject }: { initial: View; lastSubject: { label: string; href: string } | null }) {
  const [view, setView] = useState<View>(initial);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch(apiUrl("/api/ballot"), { cache: "no-store" });
        if (r.ok) setView((await r.json()) as View);
      } catch {
        /* keep */
      }
      tick((n) => n + 1);
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  const b = view.ballot;
  if (!b) {
    return (
      <div>
        <p className="label label-dark">Nobody on the block yet</p>
        {lastSubject ? (
          <>
            <p className="label label-dark mt-8">Last exposed</p>
            <Link href={lastSubject.href} className="no-underline block mt-2">
              <GlitchText className="text-[44px] sm:text-[72px] md:text-[104px]">{lastSubject.label}</GlitchText>
            </Link>
          </>
        ) : null}
        <p className="mt-8 text-mute text-[13px]">The next ballot opens at the top of the hour. Put a name on it below.</p>
      </div>
    );
  }
  const open = !b.closed && Date.parse(b.closes_at) > Date.now();
  const ordered = [...b.options].sort((x, y) => (view.tally[y.key] ?? 0) - (view.tally[x.key] ?? 0));
  const lead = b.closed && b.winner ? b.options.find((o) => o.key === b.winner) ?? ordered[0] : ordered[0];
  const n = view.tally[lead.key] ?? 0;
  const pct = view.total ? Math.round((n / view.total) * 100) : 0;
  const tied = !b.closed && ordered.length > 1 && (view.tally[ordered[1].key] ?? 0) === n;
  const href = lead.kind === "handle" ? `/persons/${lead.ref.replace(/^@/, "")}` : null;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 ticker">
        <span>
          {b.closed ? "the hour closed" : open ? "the vote is open" : "counting"} · ballot <b>{b.id.replace("T", " ")}h</b>
        </span>
        <span>
          {view.total} vote{view.total === 1 ? "" : "s"}
          {open ? (
            <>
              {" "}· closes in <b>{left(b.closes_at)}</b>
            </>
          ) : null}
        </span>
      </div>
      <p className="label label-dark mt-8">{b.closed ? "Exposed" : view.total === 0 ? "First on the block" : tied ? "Tied at the top" : "Leading"}</p>
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
        {b.closed && b.case_n ? (
          <>
            Investigated.{" "}
            <Link href={`/cases/${b.case_n}`} className="underline text-manila">
              Read case {String(b.case_n).padStart(4, "0")}
            </Link>
            .
          </>
        ) : b.closed ? (
          "Won the hour. The file is being written."
        ) : view.total === 0 ? (
          "No votes yet. The first vote decides who the agent reads first."
        ) : (
          `${n} vote${n === 1 ? "" : "s"}, ${pct}% of the hour.`
        )}
      </p>
      <div className="mt-10 file p-5">
        <BallotVote initial={view} compact />
      </div>
    </div>
  );
}
