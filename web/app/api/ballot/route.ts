import { ensureCurrentBallot } from "@/lib/ballot";
import { getBallots, tally } from "@/lib/store";
import { json } from "@/lib/api";
import { dyn } from "@/lib/request";
import { STATIC } from "@/lib/dyn";


export async function GET(req: Request) {
  await dyn();
  const u = STATIC ? null : new URL(req.url);
  const b = await ensureCurrentBallot();
  const t = b ? tally(b) : {};
  const total = Object.values(t).reduce((a, c) => a + c, 0);
  const out: Record<string, unknown> = { ballot: b, tally: t, total };
  if (STATIC || u?.searchParams.get("history")) {
    out.history = (await getBallots())
      .filter((x) => x.closed)
      .map((x) => ({ id: x.id, options: x.options, winner: x.winner, runner_up: x.runner_up, tally: tally(x), votes: Object.keys(x.votes).length }));
  }
  return json(out);
}
