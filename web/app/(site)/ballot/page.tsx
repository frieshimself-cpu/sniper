import type { Metadata } from "next";
import { ensureTodayBallot } from "@/lib/ballot";
import { getBallots, tally } from "@/lib/store";
import { minVoteBalance, rpcStatus } from "@/lib/solana";
import { enforce } from "@/lib/policy";
import { BallotVote } from "@/components/BallotVote";

export const metadata: Metadata = { title: "Ballot" };

export default function BallotPage() {
  const today = ensureTodayBallot();
  const t = today ? tally(today) : {};
  const total = Object.values(t).reduce((a, b) => a + b, 0);
  const history = getBallots().filter((b) => b.closed);
  const rpc = rpcStatus();
  const mint = enforce(process.env.CRIME_MINT ?? "");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-4xl md:text-5xl">The ballot</h1>
        <p className="mt-2 text-mute text-xs uppercase tracking-[0.14em]">
          Four subjects a day · one wallet, one vote · min {minVoteBalance().toLocaleString("en-US")} {mint ? "CRIME" : "CRIME (mint unset)"} ·
          runner-up carries
        </p>
      </div>
      <div className="file p-5 md:p-8">
        <BallotVote initial={{ ballot: today, tally: t, total }} />
        {rpc !== "ok" ? (
          <p className="mt-4 text-xs text-stamp">
            {rpc === "off" ? "Balance check is off. Demo mode." : "RPC or CRIME_MINT not configured. Votes are refused until it is."}
          </p>
        ) : null}
      </div>

      <section>
        <h2 className="text-2xl mb-4">History</h2>
        {history.length === 0 ? (
          <p className="text-mute">No closed ballots yet.</p>
        ) : (
          <div className="file p-5">
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="data">
                <thead>
                  <tr>
                    <th>Ballot</th>
                    <th>Winner</th>
                    <th>Runner-up</th>
                    <th>Votes</th>
                    <th>Options</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((b) => {
                    const tt = tally(b);
                    const label = (k?: string) => b.options.find((o) => o.key === k)?.label ?? "—";
                    return (
                      <tr key={b.id}>
                        <td>{b.id}</td>
                        <td className="font-semibold">{label(b.winner)}</td>
                        <td>{label(b.runner_up)}</td>
                        <td>{Object.keys(b.votes).length}</td>
                        <td className="whitespace-normal">
                          {b.options.map((o) => `${o.label} ${tt[o.key] ?? 0}`).join(" · ")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
