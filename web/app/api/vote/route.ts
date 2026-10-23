import { castVote, getBallot, tally } from "@/lib/store";
import { isBase58Pubkey, verifySigned, voteMessage } from "@/lib/sign";
import { balanceCheckEnabled, minVoteBalance, rpcUrl, tokenBalance } from "@/lib/solana";
import { body, error, json } from "@/lib/api";

export const dynamic = "force-dynamic";
export { OPTIONS } from "@/lib/api";

export async function POST(req: Request) {
  const b = await body<{ ballot?: string; option?: string; wallet?: string; signature?: string }>(req);
  if (!b) return error(400, "Bad JSON.");
  const { ballot, option, wallet, signature } = b;
  if (typeof ballot !== "string" || typeof option !== "string" || !isBase58Pubkey(wallet)) return error(400, "ballot, option and wallet required.");
  if (!verifySigned(voteMessage(ballot, option), signature, wallet)) return error(401, "Bad signature.");

  const current = getBallot(ballot);
  if (!current) return error(404, "No such ballot.");
  if (!current.options.some((o) => o.key === option)) return error(400, "Not an option.");

  if (balanceCheckEnabled()) {
    const mint = process.env.CRIME_MINT?.trim();
    if (!mint || !rpcUrl()) return error(503, "Voting is not configured.");
    let held: number;
    try {
      held = await tokenBalance(wallet, mint);
    } catch {
      return error(502, "Balance check failed. Try again.");
    }
    if (held < minVoteBalance()) return error(403, `Wallet holds ${held}. Minimum is ${minVoteBalance()}.`);
  }

  const r = castVote(ballot, wallet, option);
  if (!r.ok) return error(r.status, r.error);
  const t = tally(r.ballot);
  return json({ ok: true, ballot: r.ballot, tally: t, total: Object.values(t).reduce((a, c) => a + c, 0) });
}
