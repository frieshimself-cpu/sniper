import { NextResponse } from "next/server";
import { getProgress } from "@/lib/progress";

export const dynamic = "force-dynamic";

/** The investigation under way, step by step. */
export async function GET() {
  return NextResponse.json(await getProgress(), { headers: { "cache-control": "no-store" } });
}
