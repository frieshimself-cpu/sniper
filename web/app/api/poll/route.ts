import { NextResponse } from "next/server";
import { currentPoll, pollHistory } from "@/lib/polls";

export const dynamic = "force-dynamic";

/** The poll on the block and the settled ones. */
export async function GET() {
  return NextResponse.json({ poll: await currentPoll(), history: pollHistory().slice(0, 50) }, { headers: { "cache-control": "no-store" } });
}
