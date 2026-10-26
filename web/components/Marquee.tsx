/** A line of tape that never stops: the record, scrolling. Enough copies to fill the width, then the whole set twice so the loop has no seam. */
export function Marquee({ items, className = "" }: { items: string[]; className?: string }) {
  if (!items.length) return null;
  const filled: string[] = [];
  while (filled.length < Math.max(items.length, 14)) filled.push(...items); // a short list is repeated until the tape is full
  const row = filled.map((t, i) => (
    <span key={i} className="marquee-item">
      {t}
      <span className="marquee-dot" aria-hidden>
        ◆
      </span>
    </span>
  ));
  return (
    <div className={`marquee ${className}`} aria-label={items.join(". ")}>
      <div className="marquee-track">
        {row}
        {row}
      </div>
    </div>
  );
}
