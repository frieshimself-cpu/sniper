/**
 * A brand image that glitches: the picture, and two copies of it sliced and shoved sideways now and then,
 * one tinted blue, one red. Pure CSS, see .glitch in globals.css. Still with reduced motion.
 */
export function Glitch({ src, alt, className = "", width, height, priority = false }: { src: string; alt: string; className?: string; width: number; height: number; priority?: boolean }) {
  return (
    <span className={`glitch ${className}`} style={{ aspectRatio: `${width} / ${height}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={width} height={height} loading={priority ? "eager" : "lazy"} decoding="async" />
      <span className="glitch-a" style={{ backgroundImage: `url(${src})` }} aria-hidden />
      <span className="glitch-b" style={{ backgroundImage: `url(${src})` }} aria-hidden />
    </span>
  );
}
