import { addDispute } from "@/lib/store";
import { disputeMessage, isBase58Pubkey, verifySigned } from "@/lib/sign";
import { body, error, json } from "@/lib/api";

export { OPTIONS } from "@/lib/api";

export async function POST(req: Request) {
  const b = await body<{ wallet?: string; signature?: string }>(req);
  if (!b) return error(400, "Bad JSON.");
  const { wallet, signature } = b;
  if (!isBase58Pubkey(wallet)) return error(400, "wallet required.");
  if (!verifySigned(disputeMessage(wallet), signature, wallet)) return error(401, "Bad signature.");
  await addDispute(wallet);
  return json({ message: "Noted." });
}
