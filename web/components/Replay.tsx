"use client";

/**
 * The investigation, played back. Everything here is the case's own data, in the order the agent found it:
 * the posts tick in, the wallets light up one by one, the money draws itself between them with the amounts,
 * the findings stamp in worst first, the headline comes on. Twelve seconds. A scrubber to go back.
 * Reduced motion gets the finished frame.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Case } from "@/lib/types";
import type { CaseGraph, GraphNode } from "@/lib/graph";
import { layout, STYLE, W, H } from "./WalletGraph";
import { GlitchText } from "./GlitchText";

const PHASES = ["the record", "the wallets", "the replay", "the findings", "the file"] as const;
const LENGTH = 12_000;
// phase boundaries, in the fraction of the whole
const CUT = [0, 0.14, 0.38, 0.72, 0.9, 1];

const fmtAt = (iso: string) => (iso ? iso.slice(0, 16).replace("T", " ") : "");

export function Replay({ c, graph }: { c: Case; graph: CaseGraph }) {
  const pos = useMemo(() => layout(graph), [graph]);
  const posts = useMemo(() => c.evidence.filter((e) => e.kind === "post").slice(0, 8), [c]);
  const txs = useMemo(() => c.evidence.filter((e) => e.kind === "tx").slice(0, 10), [c]);
  // wallets arrive in the order the evidence first mentions them; the subject first
  const order = useMemo(() => {
    const seen: string[] = [];
    for (const n of graph.nodes) if (n.kind === "handle") seen.push(n.id);
    for (const e of [...c.evidence].sort((a, b) => (a.at || "").localeCompare(b.at || ""))) if (e.wallet && graph.nodes.some((n) => n.id === e.wallet) && !seen.includes(e.wallet)) seen.push(e.wallet);
    for (const n of graph.nodes) if (!seen.includes(n.id)) seen.push(n.id);
    return seen;
  }, [graph, c]);
  const edges = useMemo(() => [...graph.edges].sort((a, b) => (a.at || "").localeCompare(b.at || "")), [graph]);

  const [t, setT] = useState(0); // 0..1
  const [playing, setPlaying] = useState(true);
  const raf = useRef(0);
  const last = useRef(0);
  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) {
      setT(1);
      setPlaying(false);
    }
  }, []);
  useEffect(() => {
    if (!playing) return;
    const tick = (now: number) => {
      if (!last.current) last.current = now;
      const dt = now - last.current;
      last.current = now;
      setT((v) => {
        const n = Math.min(1, v + dt / LENGTH);
        if (n >= 1) setPlaying(false);
        return n;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf.current);
      last.current = 0;
    };
  }, [playing]);

  const phase = Math.max(0, CUT.findIndex((c, i) => t >= c && t < CUT[i + 1]));
  const within = (i: number) => Math.min(1, Math.max(0, (t - CUT[i]) / (CUT[i + 1] - CUT[i])));
  const postsOn = Math.floor(within(0) * posts.length + (t >= CUT[1] ? 1 : 0));
  const walletsOn = Math.floor(within(1) * order.length + (t >= CUT[2] ? 1 : 0));
  const edgesOn = Math.floor(within(2) * edges.length + (t >= CUT[3] ? 1 : 0));
  const txOn = Math.floor(within(2) * txs.length + (t >= CUT[3] ? 1 : 0));
  const findingsOn = Math.floor(within(3) * c.findings.length + (t >= CUT[4] ? 1 : 0));
  const fileOn = t >= CUT[4];
  const nodeOn = new Set(order.slice(0, walletsOn));
  const solMoved = edges
    .slice(0, edgesOn)
    .filter((e) => e.kind === "sol")
    .reduce((a, e) => a + (Number(e.amount.replace(/[^0-9.]/g, "")) || 0), 0);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const maxW = Math.max(...graph.nodes.map((n) => n.weight), 1);
  const r = (n: GraphNode) => 13 + Math.min(15, (n.weight / maxW) * 15);

  return (
    <div className="replay">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="replay-phase flex flex-wrap gap-x-4 gap-y-1">
          {PHASES.map((p, i) => (
            <span key={p}>
              {i === phase ? <b>{`0${i + 1} ${p}`}</b> : `0${i + 1} ${p}`}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-mute">
          <button
            type="button"
            className="nav-link"
            onClick={() => {
              if (t >= 1) {
                setT(0);
                setPlaying(true);
              } else setPlaying((p) => !p);
            }}
          >
            {t >= 1 ? "replay" : playing ? "pause" : "play"}
          </button>
          <input type="range" min={0} max={1000} value={Math.round(t * 1000)} onChange={(e) => { setPlaying(false); setT(Number(e.target.value) / 1000); }} aria-label="Scrub the replay" className="w-28 accent-[#b3121b]" />
        </div>
      </div>
      <div className="replay-bar mb-4">
        <span style={{ width: `${t * 100}%` }} />
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_1fr_240px]">
        {/* the record */}
        <div className="file p-4 order-2 md:order-1">
          <p className="label">The record</p>
          <ol className="replay-log mt-3 flex flex-col gap-2">
            {posts.length === 0 ? <li className="in on">No posts on this file. The chain spoke alone.</li> : null}
            {posts.map((p, i) => (
              <li key={i} className={i < postsOn ? "in" : ""}>
                <span className="on">{fmtAt(p.at)}</span> · {p.note}
              </li>
            ))}
          </ol>
          <p className="label mt-5">Transfers</p>
          <ol className="replay-log mt-3 flex flex-col gap-1">
            {txs.map((e, i) => (
              <li key={i} className={i < txOn ? "in" : ""}>
                <span className="on">{fmtAt(e.at)}</span> · {e.amount ?? ""} · {e.note}
              </li>
            ))}
          </ol>
        </div>

        {/* the stage */}
        <div className="replay-stage order-1 md:order-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="The investigation, played back">
            <defs>
              <pattern id="rgrid" width="28" height="28" patternUnits="userSpaceOnUse">
                <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#111115" strokeWidth="1" />
              </pattern>
              <filter id="rglow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <marker id="rarrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#b3121b" />
              </marker>
            </defs>
            <rect width={W} height={H} fill="url(#rgrid)" />
            {[120, 220, 320].map((rr) => (
              <circle key={rr} cx={W / 2} cy={H / 2} r={rr} fill="none" stroke="#1a1a20" strokeDasharray="2 6" />
            ))}
            {/* a sweep while the wallets are being found */}
            {phase === 1 ? (
              <g transform={`translate(${W / 2} ${H / 2})`} opacity="0.5">
                <line x1="0" y1="0" x2={Math.cos(within(1) * Math.PI * 6) * 360} y2={Math.sin(within(1) * Math.PI * 6) * 360} stroke="#5f8fd8" strokeWidth="1" />
              </g>
            ) : null}

            {edges.map((e, i) => {
              const a = pos.get(e.from);
              const b = pos.get(e.to);
              if (!a || !b) return null;
              const on = i < edgesOn && nodeOn.has(e.from) && nodeOn.has(e.to);
              const na = byId.get(e.from)!;
              const nb = byId.get(e.to)!;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const d = Math.sqrt(dx * dx + dy * dy) || 1;
              const x1 = a.x + (dx / d) * (r(na) + 3);
              const y1 = a.y + (dy / d) * (r(na) + 3);
              const x2 = b.x - (dx / d) * (r(nb) + 5);
              const y2 = b.y - (dy / d) * (r(nb) + 5);
              const mx = (x1 + x2) / 2 - (dy / d) * 14;
              const my = (y1 + y2) / 2 + (dx / d) * 14;
              const path = `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
              const sol = e.kind === "sol";
              return (
                <g key={i} className={`replay-edge ${on ? "" : "off"}`}>
                  <path d={path} fill="none" stroke="#5f8fd8" strokeOpacity="0.35" strokeWidth="1" transform="translate(-1.2 0)" />
                  <path d={path} fill="none" stroke="#c4344a" strokeOpacity="0.3" strokeWidth="1" transform="translate(1.2 0)" />
                  <path d={path} fill="none" stroke={sol ? "#b3121b" : "#8a8a92"} strokeWidth={1.4} pathLength={1000} className={on ? "draw-in" : ""} markerEnd={sol ? "url(#rarrow)" : undefined} />
                  <path d={path} fill="none" stroke={sol ? "#ff5a66" : "#e8e4da"} strokeWidth={1.4} strokeDasharray="3 21" strokeOpacity={0.6} className="flow" />
                  {e.amount ? (
                    <text x={mx} y={my - 7} fontSize="10" fill={sol ? "#e8e4da" : "#8a8a92"} textAnchor="middle" fontFamily="IBM Plex Mono, monospace">
                      {e.amount}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {graph.nodes.map((n) => {
              const p = pos.get(n.id)!;
              const s = STYLE[n.kind];
              const rr = r(n);
              const on = nodeOn.has(n.id);
              const key = n.kind === "deployer" || n.kind === "funder" || n.kind === "handle";
              const idx = order.indexOf(n.id);
              const fresh = on && idx === walletsOn - 1 && phase === 1;
              return (
                <g key={n.id} transform={`translate(${p.x} ${p.y})`} className={`replay-node ${on ? "" : "off"}`}>
                  {fresh ? <circle r="0" fill="none" stroke={s.glow} strokeWidth="1.5" className="ping" /> : null}
                  {key ? <circle r={rr + 6} fill="none" stroke={s.glow} strokeOpacity="0.4" strokeDasharray="2 4" /> : null}
                  {n.kind === "handle" ? (
                    <rect x={-rr * 2.6} y={-rr * 0.85} width={rr * 5.2} height={rr * 1.7} rx={2} fill={s.fill} stroke={s.stroke} strokeWidth={1.5} filter="url(#rglow)" />
                  ) : n.kind === "service" || n.kind === "pool" ? (
                    <g transform="rotate(45)">
                      <rect x={-rr * 0.78} y={-rr * 0.78} width={rr * 1.56} height={rr * 1.56} fill={s.fill} stroke={s.stroke} strokeWidth={1.5} filter={n.kind === "service" ? "url(#rglow)" : undefined} />
                    </g>
                  ) : (
                    <circle r={rr} fill={s.fill} stroke={s.stroke} strokeWidth={key ? 2 : 1.3} filter={key ? "url(#rglow)" : undefined} />
                  )}
                  <text y={n.kind === "handle" ? 4 : rr + 15} fontSize={n.kind === "handle" ? 11 : 10} fill={s.text} textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontWeight={600}>
                    {n.label}
                  </text>
                  {n.sub && n.kind !== "handle" ? (
                    <text y={rr + 27} fontSize="8.5" fill="#8a8a92" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" letterSpacing="1.2">
                      {n.sub.toUpperCase()}
                    </text>
                  ) : null}
                </g>
              );
            })}

            <g transform="translate(14 22)" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#8a8a92" letterSpacing="1.5">
              <text>{`${walletsOn}/${order.length} ADDRESSES · ${Math.min(edgesOn, edges.length)}/${edges.length} TRANSFERS`}</text>
            </g>
          </svg>
          <div className="absolute right-3 bottom-3 text-right">
            <div className="label label-dark">SOL moved</div>
            <div className="replay-counter abr">{Math.round(solMoved).toLocaleString("en-US")}</div>
          </div>
        </div>

        {/* the findings */}
        <div className="file p-4 order-3">
          <p className="label">Findings, worst first</p>
          <ol className="mt-3 flex flex-col gap-3">
            {c.findings.map((f, i) => (
              <li key={f.code} className={`replay-finding ${i < findingsOn ? "in" : ""} grid grid-cols-[auto_1fr] gap-2 items-start text-[12px]`}>
                <span className="replay-weight inline-block min-w-[28px] text-center text-[10px] font-semibold px-1 py-0.5 border border-stamp text-stamp">{f.score ?? "·"}</span>
                <span className="font-semibold leading-snug">{f.title}</span>
              </li>
            ))}
          </ol>
          <div className={`replay-finding ${fileOn ? "in" : ""} mt-6 border-t border-ink/30 pt-4`}>
            <p className="label">The file</p>
            <p className="mt-2 text-[12px] leading-snug">{c.headline}</p>
            <p className="mt-3 text-stamp text-[11px] font-semibold uppercase tracking-[0.14em]">Convictions 0</p>
          </div>
        </div>
      </div>
      <div className={`mt-4 ${fileOn ? "" : "opacity-0"}`} style={{ transition: "opacity 600ms ease" }}>
        <GlitchText className="text-[28px] sm:text-[40px] md:text-[56px]">{c.kind === "person" && c.subjects[0] ? c.subjects[0] : `$${c.token.symbol}`}</GlitchText>
      </div>
    </div>
  );
}
