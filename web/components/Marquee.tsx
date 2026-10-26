/** A line of tape that never stops: the record, scrolling. Two copies so the loop has no seam. */
export function Marquee({ items, className = "" }: { items: string[]; className?: string }) {
  if (!items.length) return null;
  const row = items.map((t, i) => (
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
