"use client";

/**
 * The investigation under way, shown as it happens. Reads /api/progress every ten seconds.
 * Idle: nothing but the next poll. Running: the subject written large, the five stations with the
 * current one lit, the steps typing in as the agent reports them, the wallets as they are found, the
 * findings as they are weighed. Done: the file, with a link. Nothing here can act; it reads.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiUrl } from "@/lib/dyn";
import type { Progress } from "@/lib/progress";
import { GlitchText } from "./GlitchText";

const STATIONS: Array<[Progress["steps"][number]["phase"], string]> = [
  ["poll", "the poll"],
  ["record", "the record"],
  ["wallets", "the wallets"],
  ["replay", "the replay"],
  ["findings", "the findings"],
  ["file", "the file"],
];

function since(iso?: string) {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

const short = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

export function Live({ initial, account }: { initial: Progress; account: string }) {
  const [p, setP] = useState<Progress>(initial);
  const [, tick] = useState(0);
  const seen = useRef(initial.steps.length);
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch(apiUrl("/api/progress"), { cache: "no-store" });
        if (r.ok) setP((await r.json()) as Progress);
      } catch {
        /* keep */
      }
      tick((n) => n + 1);
    }, 10_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    seen.current = p.steps.length;
  }, [p.steps.length]);

  const running = p.state === "running";
  const phase = p.steps.length ? p.steps[p.steps.length - 1].phase : null;
  const phaseIdx = STATIONS.findIndex(([k]) => k === phase);
  const subject = p.subject && !p.subject.startsWith("poll ") ? p.subject : null;

  if (p.state === "idle" || (!running && !subject && !p.poll_id)) {
    return (
      <div className="live">
        <p className="live-phase">
          <span className="live-dot" aria-hidden /> nothing under way
        </p>
        <p className="mt-4 text-[13px] text-mute max-w-md">
          The next investigation starts the minute a poll on{" "}
          <a href={`https://x.com/${account}`} target="_blank" rel="noopener noreferrer" className="underline text-manila">
            @{account}
          </a>{" "}
          closes with a winner. Everything the agent does appears here while it does it.
        </p>
      </div>
    );
  }

  return (
    <div className="live">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="live-phase">
          <span className={`live-dot ${running ? "on" : ""}`} aria-hidden />
          {running ? "under way" : p.state === "done" ? "finished" : "stopped"}
          {p.started_at ? <span className="ml-3 opacity-60">{running ? `${since(p.started_at)} in` : since(p.updated_at) + " ago"}</span> : null}
        </p>
        {p.poll_url ? (
          <a href={p.poll_url} target="_blank" rel="noopener noreferrer" className="text-[10px] uppercase tracking-[0.2em] text-mute underline">
            the poll
          </a>
        ) : null}
      </div>

      {subject ? (
        <div className="mt-4 overflow-hidden">
          <GlitchText className="text-[40px] sm:text-[64px] md:text-[88px]">{subject}</GlitchText>
        </div>
      ) : null}

      <ol className="live-stations mt-6">
        {STATIONS.map(([k, label], i) => (
          <li key={k} className={i < phaseIdx ? "done" : i === phaseIdx ? (running ? "now" : "done") : ""}>
            <span className="live-station-n">0{i + 1}</span>
            <span>{label}</span>
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_280px]">
        <ol className="live-log" aria-live="polite">
          {p.steps.map((s, i) => (
            <li key={`${s.at}-${i}`} className={i >= seen.current - 1 && running ? "fresh" : ""}>
              <span className="live-at">{s.at.slice(11, 19)}</span>
              <span className="live-k">{s.phase}</span>
              <span>{s.text}</span>
            </li>
          ))}
          {running ? (
            <li className="live-cursor" aria-hidden>
              <span className="live-at">{" "}</span>
              <span className="live-k">{" "}</span>
              <span className="blink">▌</span>
            </li>
          ) : null}
        </ol>
        <div className="flex flex-col gap-6">
          <div>
            <p className="label label-dark">Wallets found · {p.wallets.length}</p>
            <ul className="mt-2 flex flex-col gap-1 text-[11px]">
              {p.wallets.slice(0, 12).map((w) => (
                <li key={w.address} className="live-wallet">
                  <a href={`https://solscan.io/account/${w.address}`} target="_blank" rel="noopener noreferrer" className="underline">
                    {short(w.address)}
                  </a>
                  <span className="live-tier">{w.tier}</span>
                  {w.via ? <span className="text-mute"> · {w.via}</span> : null}
                </li>
              ))}
              {p.wallets.length === 0 ? <li className="text-mute">none yet</li> : null}
            </ul>
          </div>
          <div>
            <p className="label label-dark">Findings · {p.findings.length}</p>
            <ol className="mt-2 flex flex-col gap-1 text-[11px]">
              {p.findings.slice(0, 8).map((f, i) => (
                <li key={i} className="live-finding">
                  <span className="live-weight">{f.score ?? "·"}</span>
                  <span>{f.title}</span>
                </li>
              ))}
              {p.findings.length === 0 ? <li className="text-mute">{running ? "weighing" : "none"}</li> : null}
            </ol>
          </div>
        </div>
      </div>

      {!running && p.message ? (
        <p className="mt-6 text-[13px]">
          {p.case_n ? (
            <Link href={`/cases/${p.case_n}`} className="underline text-manila">
              {p.message}
            </Link>
          ) : (
            <span className="text-mute">{p.message}</span>
          )}
        </p>
      ) : null}
    </div>
  );
}
