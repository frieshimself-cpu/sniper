"use client";

import { useEffect, useState } from "react";
import type { Ballot } from "@/lib/store";
import { signText } from "./wallet";

interface View {
  ballot: Ballot | null;
  tally: Record<string, number>;
  total: number;
}

function hoursLeft(iso: string) {
  return Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 3_600_000));
}

export function BallotVote({ initial, compact = false }: { initial: View; compact?: boolean }) {
  const [view, setView] = useState<View>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch("/api/ballot", { cache: "no-store" });
        if (r.ok) setView((await r.json()) as View);
      } catch {
        /* keep */
      }
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  const b = view.ballot;
  if (!b) return <p className="text-mute">No ballot today.</p>;

  async function vote(option: string) {
    if (!b) return;
    setBusy(option);
    setNote(null);
    try {
      const { wallet, signature } = await signText(`CRIME ballot ${b.id} vote ${option}`);
      const r = await fetch("/api/vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ballot: b.id, option, wallet, signature }),
      });
      const json = (await r.json()) as { error?: string; ballot?: Ballot; tally?: Record<string, number>; total?: number };
      if (!r.ok) throw new Error(json.error ?? `Vote rejected (${r.status}).`);
      setView({ ballot: json.ballot ?? b, tally: json.tally ?? view.tally, total: json.total ?? view.total });
      setNote("Vote recorded.");
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const max = Math.max(1, ...Object.values(view.tally));
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-ink pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">Ballot {b.id}</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">
          {view.total} votes · closes in {hoursLeft(b.closes_at)}h
        </span>
      </div>
      <ol className={`mt-4 grid gap-4 ${compact ? "" : "sm:grid-cols-2"}`}>
        {b.options.map((o, i) => {
          const n = view.tally[o.key] ?? 0;
          const pct = view.total ? Math.round((n / view.total) * 100) : 0;
          return (
            <li key={o.key} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="headline text-lg">
                  <span className="font-mono text-xs font-semibold mr-2 opacity-75">{String(i + 1).padStart(2, "0")}</span>
                  {o.label}
                  {b.carried === o.key ? <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] opacity-75">carried</span> : null}
                </span>
                <span className="text-sm font-semibold">
                  {n} · {pct}%
                </span>
              </div>
              <div className="tally">
                <span style={{ width: `${(n / max) * 100}%` }} />
              </div>
              <button type="button" className="btn self-start" disabled={busy !== null || b.closed} onClick={() => vote(o.key)}>
                {busy === o.key ? "Signing" : "Vote"}
              </button>
            </li>
          );
        })}
      </ol>
      {note ? (
        <p className="mt-4 text-xs" role="status">
          {note}
        </p>
      ) : null}
      {!compact ? (
        <p className="mt-6 text-xs opacity-70">
          A vote is a signed message: <code>CRIME ballot {b.id} vote &lt;option&gt;</code>. Nothing is sent on-chain. One vote per
          wallet. The wallet must hold the minimum balance. Votes are counted, not weighted.
        </p>
      ) : null}
    </div>
  );
}
