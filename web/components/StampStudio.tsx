"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const RED = "#b3121b";
const MANILA = "#ece3cc";
const INK = "#141414";

interface StampState {
  x: number; // centre, in image pixels
  y: number;
  rotate: number; // degrees
  scale: number; // stamp height as fraction of image height
  text: string;
  opacity: number;
}

function drawStamp(ctx: CanvasRenderingContext2D, s: StampState, imgH: number) {
  const h = imgH * s.scale;
  const fontPx = h * 0.62;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate((s.rotate * Math.PI) / 180);
  ctx.globalAlpha = s.opacity;
  ctx.globalCompositeOperation = "multiply";
  ctx.font = `700 ${fontPx}px "IBM Plex Sans", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const textW = ctx.measureText(s.text).width + fontPx * 0.08 * Math.max(0, s.text.length - 1);
  const w = textW + fontPx * 0.7;
  const r = h * 0.1;
  const outer = Math.max(1.5, h * 0.05);
  const inner = Math.max(1, h * 0.02);
  ctx.strokeStyle = RED;
  ctx.fillStyle = RED;
  ctx.lineWidth = outer;
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.stroke();
  ctx.lineWidth = inner;
  const pad = outer * 1.4;
  roundRect(ctx, -w / 2 + pad, -h / 2 + pad, w - pad * 2, h - pad * 2, r * 0.6);
  ctx.stroke();
  // letter-spaced text
  const chars = s.text.split("");
  const gap = fontPx * 0.08;
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  let x = -total / 2;
  ctx.textAlign = "left";
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], x, -h * 0.05);
    x += widths[i] + gap;
  }
  ctx.font = `600 ${fontPx * 0.14}px "IBM Plex Mono", monospace`;
  ctx.textAlign = "center";
  ctx.fillText("C . R . I . M . E .", 0, h * 0.33);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function placeholder(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = MANILA;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.lineWidth = 1;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.fillStyle = INK;
  ctx.font = '700 48px "IBM Plex Sans", sans-serif';
  ctx.fillText("C.R.I.M.E.", 48, 96);
  ctx.font = '500 18px "IBM Plex Mono", monospace';
  ctx.fillText("UPLOAD AN IMAGE. OR STAMP THIS.", 48, 140);
  return c;
}

export function StampStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<CanvasImageSource & { width: number; height: number } | null>(null);
  const [stamp, setStamp] = useState<StampState>({ x: 0, y: 0, rotate: -12, scale: 0.22, text: "LEGAL", opacity: 0.92 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    const p = placeholder(1200, 630);
    setImg(p);
    setStamp((s) => ({ ...s, x: 1200 * 0.72, y: 630 * 0.55 }));
    document.fonts?.load('700 48px "IBM Plex Sans"').catch(() => undefined);
  }, []);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c || !img) return;
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    drawStamp(ctx, stamp, img.height);
  }, [img, stamp]);

  useEffect(() => {
    draw();
  }, [draw]);

  function onFile(file: File | undefined) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      setImg(el);
      setStamp((s) => ({ ...s, x: el.width * 0.7, y: el.height * 0.6 }));
      URL.revokeObjectURL(url);
    };
    el.src = url;
  }

  function toImageCoords(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = toImageCoords(e);
    drag.current = { dx: stamp.x - p.x, dy: stamp.y - p.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drag.current) return;
    const p = toImageCoords(e);
    const { dx, dy } = drag.current;
    setStamp((s) => ({ ...s, x: p.x + dx, y: p.y + dy }));
  }
  function onUp() {
    drag.current = null;
  }

  function download() {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement("a");
    a.download = "stamped.png";
    a.href = c.toDataURL("image/png");
    a.click();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="file p-3">
        <canvas
          ref={canvasRef}
          className="block w-full h-auto touch-none cursor-move"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label="Stamp canvas. Drag to move the stamp."
        />
      </div>
      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="label label-dark">Image</span>
          <input type="file" accept="image/*" className="text-xs" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="label label-dark">Text</span>
          <input className="input" maxLength={12} value={stamp.text} onChange={(e) => setStamp((s) => ({ ...s, text: e.target.value.toUpperCase() || "LEGAL" }))} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="label label-dark">Rotate {stamp.rotate}°</span>
          <input type="range" min={-45} max={45} value={stamp.rotate} onChange={(e) => setStamp((s) => ({ ...s, rotate: Number(e.target.value) }))} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="label label-dark">Size</span>
          <input type="range" min={0.08} max={0.6} step={0.01} value={stamp.scale} onChange={(e) => setStamp((s) => ({ ...s, scale: Number(e.target.value) }))} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="label label-dark">Opacity</span>
          <input type="range" min={0.3} max={1} step={0.02} value={stamp.opacity} onChange={(e) => setStamp((s) => ({ ...s, opacity: Number(e.target.value) }))} />
        </label>
        <button type="button" className="btn btn-red" onClick={download}>
          Download PNG
        </button>
        <p className="text-xs text-mute">Drag the stamp on the canvas. Everything runs in your browser.</p>
      </div>
    </div>
  );
}
