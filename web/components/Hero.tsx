"use client";

/**
 * The opening frame. The knife draws itself in four strokes, blue, red, green and bone, a hair apart, the way
 * the drawing is. A line types itself under the words. Then the figures.
 */
import { useEffect, useRef } from "react";
import { KNIFE_PATH, KNIFE_BOX } from "./knifePath";
import { Glitch } from "./Glitch";
import { withBase } from "@/lib/dyn";

export function Hero({ children, line }: { children: React.ReactNode; line: string }) {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const id = requestAnimationFrame(() => el.classList.add("draw"));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="hero">
      <svg ref={svg} className="hero-knife" viewBox={KNIFE_BOX} aria-hidden>
        <path className="k-b" d={KNIFE_PATH} pathLength={1000} />
        <path className="k-r" d={KNIFE_PATH} pathLength={1000} />
        <path className="k-g" d={KNIFE_PATH} pathLength={1000} />
        <path className="k-w" d={KNIFE_PATH} pathLength={1000} />
      </svg>
      <div className="relative md:max-w-[58%]">
        <Glitch src={withBase("/brand/wordmark.png")} alt="CRIME IS LEGAL" width={1502} height={392} priority className="w-full max-w-[720px]" />
        <p className="mt-5 text-[13px] sm:text-[14px] text-manila">
          <span className="typed">{line}</span>
        </p>
        {children}
      </div>
    </div>
  );
}
