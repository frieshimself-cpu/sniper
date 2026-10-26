import type { Hop } from "@/lib/types";
import { isHiddenLabel } from "@/lib/data";
import { short, solscanAccount } from "@/lib/format";

export function MoneyTrail({ hops }: { hops: Hop[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-y-3">
      {hops.map((h, i) => (
        <li key={i} className="flex items-center">
          {i > 0 ? <span aria-hidden className="block w-5 h-px bg-ink mx-1" /> : null}
          <span className="pill pill-ink normal-case tracking-normal gap-3">
            <span className="uppercase tracking-[0.12em] font-semibold">{h.label}</span>
            {isHiddenLabel(h.address) ? (
              <span className="redacted" title="disputed, hidden" aria-label="hidden wallet" />
            ) : (
              <a href={solscanAccount(h.address)} target="_blank" rel="noopener noreferrer" className="underline">
                {short(h.address)}
              </a>
            )}
            <span className="font-semibold">{h.amount}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
