"use client";

import { apiUrl, withBase } from "@/lib/dyn";

import { useEffect, useRef, useState } from "react";
import type { Stats } from "@/lib/data";

type Figures = Pick<Stats, "cases_opened" | "crimes_found" | "convictions">;

function useCountUp(target: number, ms = 900) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(start + (target - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

export function Counter({ initial, compact = false, poll = 20_000 }: { initial: Figures; compact?: boolean; poll?: number }) {
  const [figures, setFigures] = useState<Figures>(initial);
  useEffect(() => {
    if (!poll) return;
    const id = setInterval(async () => {
      try {
        const r = await fetch(apiUrl("/api/stats"), { cache: "no-store" });
        if (r.ok) setFigures((await r.json()) as Figures);
      } catch {
        /* keep last figures */
      }
    }, poll);
    return () => clearInterval(id);
  }, [poll]);

  const cases = useCountUp(figures.cases_opened);
  const crimes = useCountUp(figures.crimes_found);

  const big = compact
    ? "text-[44px] sm:text-[56px]"
    : "text-[64px] sm:text-[96px] md:text-[128px] lg:text-[150px]";
  const items: Array<[string, number, boolean]> = [
    ["Cases opened", cases, false],
    ["Crimes found", crimes, false],
    ["Convictions", figures.convictions, true],
  ];
  return (
    <dl className={`grid gap-6 ${compact ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3"}`} aria-live="polite">
      {items.map(([label, value, red]) => (
        <div key={label} className="min-w-0">
          <dt className="label label-dark">{label}</dt>
          <dd className={`${big} leading-none font-semibold tracking-tight ${red ? "text-stamp" : ""}`}>
            {value.toLocaleString("en-US")}
          </dd>
        </div>
      ))}
    </dl>
  );
}
