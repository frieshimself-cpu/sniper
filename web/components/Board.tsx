"use client";

/**
 * The evidence board behind the hero: wallets as points, money as threads, drifting.
 * Canvas, a few dozen nodes, one requestAnimationFrame. Pauses when off screen or when motion is reduced.
 */
import { useEffect, useRef } from "react";

interface Dot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hot: boolean;
}

export function Board({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let dots: Dot[] = [];
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(18, Math.min(64, Math.floor((w * h) / 16000)));
      dots = Array.from({ length: n }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        r: 1 + Math.random() * 1.6,
        hot: i % 9 === 0,
      }));
    };

    let raf = 0;
    let visible = true;
    let last = performance.now();
    const draw = (t: number) => {
      const dt = Math.min(50, t - last);
      last = t;
      ctx.clearRect(0, 0, w, h);
      if (!reduced) {
        for (const d of dots) {
          d.x += d.vx * dt * 0.06;
          d.y += d.vy * dt * 0.06;
          if (d.x < -10) d.x = w + 10;
          if (d.x > w + 10) d.x = -10;
          if (d.y < -10) d.y = h + 10;
          if (d.y > h + 10) d.y = -10;
        }
      }
      // threads: the nearer two wallets are, the darker the line; the hot ones draw red
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const a = dots[i];
          const b = dots[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > 150 * 150) continue;
          const k = 1 - Math.sqrt(d2) / 150;
          const red = a.hot || b.hot;
          ctx.strokeStyle = red ? `rgba(179,18,27,${0.35 * k})` : `rgba(226,221,209,${0.16 * k})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      for (const d of dots) {
        // the split edge: blue to the left, red to the right, bone in the middle
        ctx.fillStyle = "rgba(95,143,216,0.55)";
        ctx.beginPath();
        ctx.arc(d.x - 1, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(196,52,74,0.55)";
        ctx.beginPath();
        ctx.arc(d.x + 1, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = d.hot ? "rgba(179,18,27,0.95)" : "rgba(232,228,218,0.9)";
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
        if (d.hot) {
          const p = ((t / 2400) % 1) as number;
          ctx.strokeStyle = `rgba(179,18,27,${0.5 * (1 - p)})`;
          ctx.beginPath();
          ctx.arc(d.x, d.y, 4 + p * 22, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      if (visible && !reduced) raf = requestAnimationFrame(draw);
    };

    resize();
    raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(performance.now());
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !reduced) {
        cancelAnimationFrame(raf);
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    });
    io.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);
  return <canvas ref={ref} className={className} aria-hidden />;
}
