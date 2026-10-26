// Server only. Request-time rendering and per-request state priming. Never import from a client component.
import { connection } from "next/server";
import { primeHidden } from "./store";
import { STATIC } from "./dyn";

/** On a server every page and route reads the agent's files at request time. In the static export, at build time. */
export async function dyn(): Promise<void> {
  if (!STATIC) await connection();
  await primeHidden();
}
