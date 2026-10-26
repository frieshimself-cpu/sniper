import { nominate, getBoard } from "@/lib/nominations";
import { isBase58Pubkey, verifySigned } from "@/lib/sign";
import { normalizeHandle, enforce } from "@/lib/policy";
import { body, error, json } from "@/lib/api";
import { dyn } from "@/lib/request";

export const OPTIONS = () => new Response(null, { status: 204 });

export async function GET() {
  await dyn();
  return json({ board: await getBoard() });
}

export async function POST(req: Request) {
  const b = await body<{ handle?: string; wallet?: string; signature?: string; note?: string }>(req);
  if (!b || typeof b.handle !== "string" || !isBase58Pubkey(b.wallet)) return error(400, "handle and wallet required.");
  const h = normalizeHandle(b.handle);
  if (!verifySigned(`CRIME nominate ${h}`, b.signature, b.wallet)) return error(401, "Bad signature.");
  const r = await nominate(h, b.wallet, b.note ? enforce(b.note) : undefined);
  if (!r.ok) return error(r.status, r.error);
  return json({ ok: true, entry: r.entry, message: "Noted." });
}
