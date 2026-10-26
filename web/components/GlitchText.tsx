/**
 * Words in the wordmark's hand: tall condensed capitals, a blue and a red edge, torn across in two places,
 * and a tear that jumps now and then. See .gtext in globals.css.
 */
export function GlitchText({ children, className = "" }: { children: string; className?: string }) {
  return (
    <span className={`gtext ${className}`} data-text={children}>
      {children}
    </span>
  );
}
