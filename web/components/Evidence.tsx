import Link from "next/link";
import type { Evidence } from "@/lib/types";
import { handleForWallet, isHiddenLabel } from "@/lib/data";
import { short, solscanAccount, solscanTx, time, date } from "@/lib/format";

function Wallet({ address }: { address?: string }) {
  if (!address) return <span>—</span>;
  if (isHiddenLabel(address)) return <span className="redacted" title="disputed, hidden" aria-label="hidden wallet" />;
  const rec = handleForWallet(address);
  return (
    <span className="inline-flex items-center gap-2">
      <a href={solscanAccount(address)} target="_blank" rel="noopener noreferrer" className="underline">
        {short(address)}
      </a>
      {rec ? (
        <Link href={`/persons/${rec.handle.slice(1)}`} className="text-stamp font-semibold no-underline">
          {rec.handle}
        </Link>
      ) : null}
    </span>
  );
}

export function EvidenceTable({ rows }: { rows: Evidence[] }) {
  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="data">
        <thead>
          <tr>
            <th>#</th>
            <th>Time</th>
            <th>Kind</th>
            <th>Ref</th>
            <th>Wallet</th>
            <th>Amount</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={i}>
              <td>{String(i + 1).padStart(2, "0")}</td>
              <td>
                {date(e.at)} {time(e.at)}
              </td>
              <td className="uppercase">{e.kind}</td>
              <td>
                {isHiddenLabel(e.ref) ? (
                  <span className="redacted" title="disputed, hidden" aria-label="hidden wallet" />
                ) : (
                  <a
                    href={e.kind === "tx" ? solscanTx(e.ref) : solscanAccount(e.ref)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {short(e.ref, 6)}
                  </a>
                )}
              </td>
              <td>
                <Wallet address={e.wallet} />
              </td>
              <td>{e.amount ?? "—"}</td>
              <td className="whitespace-normal min-w-48">{e.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
