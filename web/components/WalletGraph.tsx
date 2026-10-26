"use client";

/**
 * The money, drawn. A small force layout in SVG: no library, no canvas, works in the static export.
 * Nodes are wallets, pools, handles and services. Edges are transfers. Click a node for its explorer page.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { CaseGraph, GraphNode } from "@/lib/graph";

const W = 920;
const H = 460;

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
        const f = 5200 / d2;
        pa.vx += (dx / Math.sqrt(d2)) * f;
        pa.vy += (dy / Math.sqrt(d2)) * f;
      }
      const tx = a.kind === "service" ? W - 110 : a.kind === "pool" ? 110 : a.kind === "deployer" || a.kind === "funder" ? W / 2 : pa.x;
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
      const f = (d - 150) * 0.004;
      pa.vx += (dx / d) * f;
      pa.vy += (dy / d) * f;
      pb.vx -= (dx / d) * f;
      pb.vy -= (dy / d) * f;
    }
    for (const p of pos.values()) {
      p.x = Math.min(W - 70, Math.max(70, p.x + p.vx));
      p.y = Math.min(H - 40, Math.max(40, p.y + p.vy));
      p.vx *= 0.6;
      p.vy *= 0.6;
    }
  }
  // centre the drawing in the canvas
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

const STYLE: Record<GraphNode["kind"], { fill: string; stroke: string; text: string }> = {
  deployer: { fill: "#b3121b", stroke: "#b3121b", text: "#ece3cc" },
  funder: { fill: "#b3121b", stroke: "#b3121b", text: "#ece3cc" },
  handle: { fill: "#ece3cc", stroke: "#b3121b", text: "#141414" },
  pool: { fill: "#1a1a1e", stroke: "#9c9686", text: "#ece3cc" },
  service: { fill: "#1a1a1e", stroke: "#ece3cc", text: "#ece3cc" },
  wallet: { fill: "#0e0e10", stroke: "#9c9686", text: "#ece3cc" },
  hidden: { fill: "#0e0e10", stroke: "#2a2a2e", text: "#9c9686" },
};

export function WalletGraph({ graph }: { graph: CaseGraph }) {
  const pos = useMemo(() => layout(graph), [graph]);
  const [active, setActive] = useState<string | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    setActive(null);
  }, [graph]);
  if (graph.nodes.length < 2) return null;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const maxW = Math.max(...graph.nodes.map((n) => n.weight), 1);
  const r = (n: GraphNode) => 14 + Math.min(16, (n.weight / maxW) * 16);
  const activeEdges = graph.edges.filter((e) => e.from === active || e.to === active);

  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block bg-page" role="img" aria-label="Wallet graph of this case">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#9c9686" />
          </marker>
          <marker id="arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#b3121b" />
          </marker>
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#17171a" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#grid)" />
        {graph.edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const na = byId.get(e.from)!;
          const nb = byId.get(e.to)!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const x1 = a.x + (dx / d) * (r(na) + 2);
          const y1 = a.y + (dy / d) * (r(na) + 2);
          const x2 = b.x - (dx / d) * (r(nb) + 4);
          const y2 = b.y - (dy / d) * (r(nb) + 4);
          const hot = active !== null && (e.from === active || e.to === active);
          const dim = active !== null && !hot;
          return (
            <g key={i} opacity={dim ? 0.18 : 1}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={e.kind === "sol" ? "#b3121b" : "#9c9686"} strokeWidth={hot ? 2.2 : 1.2} strokeDasharray={e.kind === "token" ? "4 4" : undefined} markerEnd={e.kind === "sol" ? "url(#arrow-red)" : "url(#arrow)"} />
              {e.amount ? (
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} fontSize="10" fill={e.kind === "sol" ? "#ece3cc" : "#9c9686"} textAnchor="middle" fontFamily="IBM Plex Mono, monospace">
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
          const dim = active !== null && active !== n.id && !activeEdges.some((e) => e.from === n.id || e.to === n.id);
          const href = n.address && n.kind !== "hidden" ? `https://solscan.io/account/${n.address}` : undefined;
          return (
            <g
              key={n.id}
              transform={`translate(${p.x} ${p.y})`}
              opacity={dim ? 0.25 : 1}
              style={{ cursor: href ? "pointer" : "default" }}
              onMouseEnter={() => setActive(n.id)}
              onMouseLeave={() => setActive(null)}
              onClick={() => href && window.open(href, "_blank", "noopener")}
            >
              {n.kind === "handle" ? (
                <rect x={-rr * 2.4} y={-rr * 0.8} width={rr * 4.8} height={rr * 1.6} rx={3} fill={s.fill} stroke={s.stroke} strokeWidth={2} />
              ) : n.kind === "service" || n.kind === "pool" ? (
                <rect x={-rr} y={-rr} width={rr * 2} height={rr * 2} rx={2} fill={s.fill} stroke={s.stroke} strokeWidth={1.5} />
              ) : (
                <circle r={rr} fill={s.fill} stroke={s.stroke} strokeWidth={n.kind === "wallet" ? 1.5 : 2} strokeDasharray={n.kind === "hidden" ? "3 3" : undefined} />
              )}
              <text y={n.kind === "handle" ? 4 : rr + 14} fontSize={n.kind === "handle" ? 11 : 10} fill={n.kind === "handle" ? s.text : "#ece3cc"} textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontWeight={600}>
                {n.label}
              </text>
              {n.sub && n.kind !== "handle" ? (
                <text y={rr + 26} fontSize="9" fill="#9c9686" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" style={{ textTransform: "uppercase", letterSpacing: "0.12em" }}>
                  {n.sub.toUpperCase()}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-1 px-1 pt-2 text-[10px] uppercase tracking-[0.14em] text-mute">
        <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-stamp align-middle mr-1.5" />deployer / funder</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm border border-manila align-middle mr-1.5" />exchange / service</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-full border border-mute align-middle mr-1.5" />wallet</span>
        <span><span className="inline-block w-4 h-px bg-stamp align-middle mr-1.5" />SOL</span>
        <span><span className="inline-block w-4 border-t border-dashed border-mute align-middle mr-1.5" />token</span>
        <span className="ml-auto">hover to trace · click to open</span>
      </div>
    </div>
  );
}
