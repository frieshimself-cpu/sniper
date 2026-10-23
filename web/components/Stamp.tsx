/**
 * The logo. A red LEGAL stamp, rotated. `size` is the base font size in px;
 * everything else scales from it.
 */
export function Stamp({
  size = 48,
  text = "LEGAL",
  sub = true,
  rotate = -12,
  className = "",
  blend = true,
}: {
  size?: number;
  text?: string;
  sub?: boolean | string;
  rotate?: number;
  className?: string;
  /** multiply blending reads as ink on manila; turn it off on dark backgrounds */
  blend?: boolean;
}) {
  const subText = sub === true ? "C.R.I.M.E." : sub || "";
  return (
    <span
      className={`inline-block select-none text-stamp font-sans font-bold leading-none ${className}`}
      style={{
        fontSize: size,
        transform: `rotate(${rotate}deg)`,
        border: `${Math.max(1.5, size * 0.055)}px solid currentColor`,
        borderRadius: size * 0.11,
        padding: `${size * 0.11}px ${size * 0.28}px`,
        letterSpacing: "0.08em",
        position: "relative",
        mixBlendMode: blend ? "multiply" : "normal",
        opacity: blend ? 0.92 : 1,
      }}
      aria-label={`${text} stamp`}
      role="img"
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: size * 0.045,
          border: `${Math.max(1, size * 0.022)}px solid currentColor`,
          borderRadius: size * 0.065,
          pointerEvents: "none",
        }}
      />
      {text}
      {subText ? (
        <span
          className="block text-center font-mono font-semibold"
          style={{ fontSize: size * 0.14, letterSpacing: "0.3em", marginTop: size * 0.05 }}
        >
          {subText}
        </span>
      ) : null}
    </span>
  );
}
