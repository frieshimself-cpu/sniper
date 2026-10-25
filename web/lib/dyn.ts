import { connection } from "next/server";

export const STATIC = process.env.NEXT_PUBLIC_STATIC === "1";

/** On a server every page and route reads the agent's files at request time. In the static export, at build time. */
export async function dyn(): Promise<void> {
  if (!STATIC) await connection();
}

/** Prefix for hand-written URLs (fetch, <a>, iframe). next/link and next/image add it themselves. */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") ?? "";
export const withBase = (p: string) => `${BASE}${p}`;

/** API URL for the client: route handler on a server, a .json file in the static export. */
export const apiUrl = (p: string) => withBase(STATIC ? `${p}.json` : p);
