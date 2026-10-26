"use client";

/**
 * The investigation under way, shown as it happens. Reads /api/progress every ten seconds.
 * Idle: nothing but the next poll. Running: the subject written large, the hour counting down, the six
 * stations with the current one lit, then three places: the record (every post as it is read and typed),
 * the wallets (drawn, and listed), and the thinking (every step as the agent reports it, the findings as
 * they are weighed). Done: the file, with a link. Nothing here can act; it reads.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiUrl } from "@/lib/dyn";
import type { Progress } from "@/lib/progress";
import type { CaseGraph } from "@/lib/graph";
import { GlitchText } from "./GlitchText";
import { WalletGraph } from "./WalletGraph";

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
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d`;
}

/** mm:ss left of the hour, from when the run began. */
function left(startIso: string, minutes: number) {
  const s = Math.max(0, Math.round((Date.parse(startIso) + minutes * 60_000 - Date.now()) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const short = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

/** The wallets found so far, drawn: the handle in the middle, its wallets around it, the links between them. */
function liveGraph(p: Progress): CaseGraph | null {
  if (!p.subject || !p.wallets.length) return null;
  const handle = p.subject;
  const g: CaseGraph = { nodes: [{ id: handle, kind: "handle", label: handle, sub: "on the block", handle, weight: 4 }], edges: [] };
  const known = new Set(p.wallets.map((w) => w.address));
  for (const w of p.wallets) {
    g.nodes.push({ id: w.address, kind: w.tier === "claimed" ? "deployer" : w.peer ? "wallet" : "funder", label: short(w.address), sub: w.via ? `${w.tier} · linked` : w.tier, address: w.address, weight: w.tier === "claimed" ? 3 : 2 });
  }
  for (const w of p.wallets) {
    if (w.peer && known.has(w.peer)) g.edges.push({ from: w.peer, to: w.address, amount: w.via ?? "linked", kind: "sol", note: w.via ?? "linked by transfers", at: "" });
    else g.edges.push({ from: handle, to: w.address, amount: w.tier, kind: "token", note: w.tier === "claimed" ? "posted by the handle" : "on the record", at: "" });
  }
  return g;
}

function Head({ n, title, count }: { n: string; title: string; count?: string }) {
  return (
    <div className="live-head">
      <span className="live-head-n">{n}</span>
      <h3>{title}</h3>
      {count ? <span className="live-head-count">{count}</span> : null}
    </div>
  );
}

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
    }, 10_000);
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      clearInterval(id);
      clearInterval(clock);
    };
  }, []);
  useEffect(() => {
    seen.current = p.steps.length;
  }, [p.steps.length]);

  const running = p.state === "running";
  const phase = p.steps.length ? p.steps[p.steps.length - 1].phase : null;
  const phaseIdx = STATIONS.findIndex(([k]) => k === phase);
  const subject = p.subject && !p.subject.startsWith("poll ") ? p.subject : null;
  const graph = liveGraph(p);
  const posts = p.posts ?? [];
  const budget = p.budget_minutes ?? 60;

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
          closes with a winner. One hour, every post and every wallet, all of it shown here while it happens.
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
        <div className="flex items-baseline gap-5">
          {running && p.started_at ? (
            <span className="live-clock" title={`${budget} minutes per person`}>
              <span className="live-clock-label">left</span> {left(p.started_at, budget)}
            </span>
          ) : null}
          {p.poll_url ? (
            <a href={p.poll_url} target="_blank" rel="noopener noreferrer" className="text-[10px] uppercase tracking-[0.2em] text-mute underline">
              the poll
            </a>
          ) : null}
        </div>
      </div>

      {subject ? (
        <div className="mt-4 overflow-hidden">
          <GlitchText className="text-[clamp(26px,8.4vw,88px)]">{subject}</GlitchText>
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

      {/* ---- the record: the posts, as they are read and typed ---------------------------- */}
      <section className="live-section">
        <Head n="A" title="The record" count={posts.length ? `${posts.length} posts shown · ${posts.filter((t) => t.type).length} typed` : running ? "reading" : "none"} />
        {posts.length ? (
          <ol className="live-posts" aria-live="polite">
            {posts.map((t, i) => (
              <li key={`${t.url}-${i}`} className={t.type ? "typed" : ""}>
                <span className="live-post-at">
                  {t.at.slice(0, 10)}
                  {t.type ? <b className="live-post-type">{t.type.replace(/_/g, " ")}</b> : null}
                </span>
                <a href={t.url} target="_blank" rel="noopener noreferrer" className="no-underline hover:underline">
                  {t.text}
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <p className="live-empty">{running ? "pulling every post the API allows, back to the first" : "nothing read"}</p>
        )}
      </section>

      {/* ---- the wallets: drawn, and listed ----------------------------------------------- */}
      <section className="live-section">
        <Head n="B" title="The wallets" count={p.wallets.length ? `${p.wallets.length} found · ${p.wallets.filter((w) => w.tier === "claimed").length} claimed · ${p.wallets.filter((w) => w.via).length} never admitted` : running ? "looking" : "none"} />
        {graph ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="border-y border-ink/30 bg-page -mx-4 px-2 md:mx-0 md:px-3 py-2 relative overflow-hidden live-graph" key={p.wallets.length}>
              <WalletGraph graph={graph} />
            </div>
            <ul className="live-wallets">
              {p.wallets.map((w) => (
                <li key={w.address} className="live-wallet">
                  <a href={`https://solscan.io/account/${w.address}`} target="_blank" rel="noopener noreferrer" className="underline">
                    {short(w.address)}
                  </a>
                  <span className="live-tier">{w.tier}</span>
                  {w.via ? <span className="text-mute"> · {w.via}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="live-empty">{running ? "the handle's own posts, the record, Arkham's files, then the money between wallets" : "none"}</p>
        )}
      </section>

      {/* ---- the thinking: every step, and the findings as they are weighed ------------------ */}
      <section className="live-section">
        <Head n="C" title="The thinking" count={`${p.steps.length} steps · ${p.findings.length} findings`} />
        <div className="grid gap-6 md:grid-cols-[1fr_280px]">
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
          <div>
            <p className="label label-dark">Findings, worst first</p>
            <ol className="mt-2 flex flex-col gap-1 text-[11px]">
              {p.findings.map((f, i) => (
                <li key={i} className="live-finding">
                  <span className="live-weight">{f.score ?? "·"}</span>
                  <span>{f.title}</span>
                </li>
              ))}
              {p.findings.length === 0 ? <li className="text-mute">{running ? "weighing" : "none"}</li> : null}
            </ol>
          </div>
        </div>
      </section>

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
