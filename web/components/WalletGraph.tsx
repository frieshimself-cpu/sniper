"use client";

/**
 * The money, drawn. A small force layout in SVG: no library, no canvas, works in the static export.
 * Nodes are wallets, pools, handles and services. Edges are transfers, and the money moves along them.
 * Hover a node to trace it; click it for the explorer. The ledger on the right reads out what is under the cursor.
 */
import { useEffect, useMemo, useState } from "react";
import type { CaseGraph, GraphNode } from "@/lib/graph";

const W = 920;
const H = 480;

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function layout(g: CaseGraph): Map<string, P> {
  const pos = new Map<string, P>();
  const n = g.nodes.length || 1;
  g.nodes.forEach((node, i) => {
    const a = (i / n) * Math.PI * 2;
    pos.set(node.id, { x: W / 2 + Math.cos(a) * 160, y: H / 2 + Math.sin(a) * 120, vx: 0, vy: 0 });
  });
  // services and pools pull to the edges, the deployer to the centre: it reads like a file, not a hairball
  for (let iter = 0; iter < 260; iter++) {
    for (const a of g.nodes) {
      const pa = pos.get(a.id)!;
      for (const b of g.nodes) {
        if (a === b) continue;
        const pb = pos.get(b.id)!;
        const dx = pa.x - pb.x;
        const dy = pa.y - pb.y;
        const d2 = Math.max(400, dx * dx + dy * dy);
        const f = 5600 / d2;
        pa.vx += (dx / Math.sqrt(d2)) * f;
        pa.vy += (dy / Math.sqrt(d2)) * f;
      }
      const tx = a.kind === "service" ? W - 120 : a.kind === "pool" ? 120 : a.kind === "deployer" || a.kind === "funder" ? W / 2 : pa.x;
      pa.vx += (tx - pa.x) * 0.01;
      pa.vy += (H / 2 - pa.y) * 0.004;
    }
    for (const e of g.edges) {
      const pa = pos.get(e.from)!;
      const pb = pos.get(e.to)!;
      if (!pa || !pb) continue;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 160) * 0.004;
      pa.vx += (dx / d) * f;
      pa.vy += (dy / d) * f;
      pb.vx -= (dx / d) * f;
      pb.vy -= (dy / d) * f;
    }
    for (const p of pos.values()) {
      p.x = Math.min(W - 80, Math.max(80, p.x + p.vx));
      p.y = Math.min(H - 48, Math.max(48, p.y + p.vy));
      p.vx *= 0.6;
      p.vy *= 0.6;
    }
  }
  const xs = [...pos.values()].map((p) => p.x);
  const ys = [...pos.values()].map((p) => p.y);
  const dx = W / 2 - (Math.min(...xs) + Math.max(...xs)) / 2;
  const dy = H / 2 - (Math.min(...ys) + Math.max(...ys)) / 2;
  for (const p of pos.values()) {
    p.x += dx;
    p.y += dy;
  }
  return pos;
}

const BONE = "#e8e4da";
const MUTE = "#8a8a92";
const RED = "#b3121b";
const BLUE = "#5f8fd8";

const STYLE: Record<GraphNode["kind"], { fill: string; stroke: string; text: string; glow: string }> = {
  deployer: { fill: "#1a0608", stroke: RED, text: BONE, glow: RED },
  funder: { fill: "#1a0608", stroke: RED, text: BONE, glow: RED },
  handle: { fill: "#15151a", stroke: BONE, text: BONE, glow: BLUE },
  pool: { fill: "#0d0d10", stroke: MUTE, text: BONE, glow: MUTE },
  service: { fill: "#0d0d10", stroke: BLUE, text: BONE, glow: BLUE },
  wallet: { fill: "#0a0a0c", stroke: MUTE, text: BONE, glow: MUTE },
  hidden: { fill: "#0a0a0c", stroke: "#2a2a2e", text: MUTE, glow: "#000" },
};

export function WalletGraph({ graph }: { graph: CaseGraph }) {
  const pos = useMemo(() => layout(graph), [graph]);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    setActive(null);
  }, [graph]);
  if (graph.nodes.length < 2) return null;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const maxW = Math.max(...graph.nodes.map((n) => n.weight), 1);
  const r = (n: GraphNode) => 13 + Math.min(15, (n.weight / maxW) * 15);
  const activeEdges = graph.edges.filter((e) => e.from === active || e.to === active);
  const activeNode = active ? byId.get(active) : null;
  const hot = (id: string) => id === "" || active === null || active === id || activeEdges.some((e) => e.from === id || e.to === id);

  return (
    <div className="relative">
      <div className="scan" aria-hidden />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="Wallet graph of this case">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={MUTE} />
          </marker>
          <marker id="arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={RED} />
          </marker>
          <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#141418" strokeWidth="1" />
          </pattern>
          <pattern id="dots" width="56" height="56" patternUnits="userSpaceOnUse">
            <circle cx="28" cy="28" r="1" fill="#26262c" />
          </pattern>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
            <stop offset="55%" stopColor="#070708" stopOpacity="0" />
            <stop offset="100%" stopColor="#070708" stopOpacity="0.9" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="#07070a" />
        <rect width={W} height={H} fill="url(#grid)" />
        <rect width={W} height={H} fill="url(#dots)" />
        {/* the rings: the centre is the subject, the rim is where the money leaves */}
        {[120, 220, 320].map((rr) => (
          <circle key={rr} cx={W / 2} cy={H / 2} r={rr} fill="none" stroke="#1b1b20" strokeWidth="1" strokeDasharray="2 6" />
        ))}
        <rect width={W} height={H} fill="url(#vignette)" />

        {graph.edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const na = byId.get(e.from)!;
          const nb = byId.get(e.to)!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const x1 = a.x + (dx / d) * (r(na) + 3);
          const y1 = a.y + (dy / d) * (r(na) + 3);
          const x2 = b.x - (dx / d) * (r(nb) + 5);
          const y2 = b.y - (dy / d) * (r(nb) + 5);
          const on = active !== null && (e.from === active || e.to === active);
          const dim = active !== null && !on;
          const sol = e.kind === "sol";
          const colour = sol ? RED : MUTE;
          // a slight bow so parallel edges do not stack
          const mx = (x1 + x2) / 2 - (dy / d) * 14;
          const my = (y1 + y2) / 2 + (dx / d) * 14;
          const path = `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
          return (
            <g key={i} opacity={dim ? 0.12 : 1} style={{ transition: "opacity 160ms ease" }}>
              {/* the split edge: a blue ghost one pixel left, a red one right, then the line itself */}
              <path d={path} fill="none" stroke={BLUE} strokeOpacity={0.35} strokeWidth={1} transform="translate(-1.2 0)" />
              <path d={path} fill="none" stroke="#c4344a" strokeOpacity={0.3} strokeWidth={1} transform="translate(1.2 0)" />
              <path d={path} fill="none" stroke={colour} strokeWidth={on ? 2 : 1.2} strokeOpacity={0.9} markerEnd={sol ? "url(#arrow-red)" : "url(#arrow)"} />
              {/* the money, moving */}
              <path d={path} fill="none" stroke={sol ? "#ff5a66" : BONE} strokeWidth={on ? 2 : 1.4} strokeDasharray="3 21" strokeOpacity={on ? 0.95 : 0.55} className="flow" />
              {e.amount ? (
                <text x={mx} y={my - 7} fontSize="10" fill={sol ? BONE : MUTE} textAnchor="middle" fontFamily="IBM Plex Mono, monospace">
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
          const dim = !hot(n.id);
          const href = n.address && n.kind !== "hidden" ? `https://solscan.io/account/${n.address}` : undefined;
          const key = n.kind === "deployer" || n.kind === "funder" || n.kind === "handle";
          return (
            <g
              key={n.id}
              transform={`translate(${p.x} ${p.y})`}
              opacity={dim ? 0.22 : 1}
              style={{ cursor: href ? "pointer" : "default", transition: "opacity 160ms ease" }}
              onMouseEnter={() => setActive(n.id)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(n.id)}
              onBlur={() => setActive(null)}
              onClick={() => href && window.open(href, "_blank", "noopener")}
              tabIndex={href ? 0 : -1}
              role={href ? "link" : undefined}
              aria-label={`${n.label}${n.sub ? `, ${n.sub}` : ""}`}
            >
              {key ? <circle r={rr} fill="none" stroke={s.glow} strokeWidth="1" className="pulse" /> : null}
              {key ? <circle r={rr + 6} fill="none" stroke={s.glow} strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 4" /> : null}
              {n.kind === "handle" ? (
                <rect x={-rr * 2.6} y={-rr * 0.85} width={rr * 5.2} height={rr * 1.7} rx={2} fill={s.fill} stroke={s.stroke} strokeWidth={1.5} filter="url(#glow)" />
              ) : n.kind === "service" || n.kind === "pool" ? (
                <g transform="rotate(45)">
                  <rect x={-rr * 0.78} y={-rr * 0.78} width={rr * 1.56} height={rr * 1.56} fill={s.fill} stroke={s.stroke} strokeWidth={1.5} filter={n.kind === "service" ? "url(#glow)" : undefined} />
                </g>
              ) : (
                <circle r={rr} fill={s.fill} stroke={s.stroke} strokeWidth={key ? 2 : 1.3} strokeDasharray={n.kind === "hidden" ? "3 3" : undefined} filter={key ? "url(#glow)" : undefined} />
              )}
              {n.kind === "deployer" || n.kind === "funder" ? <circle r={3} fill={RED} /> : null}
              {n.kind === "wallet" ? <circle r={2} fill={MUTE} /> : null}
              <text y={n.kind === "handle" ? 4 : rr + 15} fontSize={n.kind === "handle" ? 11 : 10} fill={s.text} textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontWeight={600}>
                {n.label}
              </text>
              {n.sub && n.kind !== "handle" ? (
                <text y={rr + 27} fontSize="8.5" fill={MUTE} textAnchor="middle" fontFamily="IBM Plex Mono, monospace" letterSpacing="1.2">
                  {n.sub.toUpperCase()}
                </text>
              ) : null}
            </g>
          );
        })}

        <g transform={`translate(${W - 14} 18)`} fontFamily="IBM Plex Mono, monospace" fontSize="9">
          <text fill={MUTE} textAnchor="end" letterSpacing="1.5">
            MONEY TRAIL · SOLANA
          </text>
        </g>
      </svg>
      <div className="px-1 pt-2 text-[10px] tracking-[0.14em] text-mute min-h-[16px] truncate" aria-live="polite">
        {activeNode
          ? `${activeNode.kind.toUpperCase()} · ${activeNode.label}${activeNode.address ? ` · ${activeNode.address}` : ""} · ${activeEdges.length} transfer${activeEdges.length === 1 ? "" : "s"}`
          : `${graph.nodes.length} ADDRESSES · ${graph.edges.length} TRANSFERS`}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 px-1 pt-1 text-[10px] lowercase tracking-[0.14em] text-mute">
        <span><span className="inline-block w-2.5 h-2.5 rounded-full border border-stamp align-middle mr-1.5" />deployer / funder</span>
        <span><span className="inline-block w-2.5 h-2.5 rotate-45 border border-fringe align-middle mr-1.5" />exchange / service</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-full border border-mute align-middle mr-1.5" />wallet</span>
        <span><span className="inline-block w-4 h-px bg-stamp align-middle mr-1.5" />sol</span>
        <span><span className="inline-block w-4 border-t border-dashed border-mute align-middle mr-1.5" />token</span>
        <span className="ml-auto">hover to trace · click to open</span>
      </div>
    </div>
  );
}
