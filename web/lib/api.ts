import { NextResponse } from "next/server";
import { enforceDeep } from "./policy";
import { getCases, getPersons } from "./data";

/** Every case number, for the static export. Also used on a server; dynamicParams stays on. */
export const caseParams = () => getCases().map((c) => ({ n: String(c.n) }));
export const handleParams = () => getPersons().map((p) => ({ handle: p.handle.slice(1) }));

export function json(data: unknown, init: ResponseInit & { maxAge?: number } = {}) {
  const { maxAge = 0, ...rest } = init;
  const res = NextResponse.json(enforceDeep(data), rest);
  res.headers.set("cache-control", maxAge ? `public, max-age=${maxAge}, s-maxage=${maxAge}` : "no-store");
  return res;
}

export function error(status: number, message: string) {
  return json({ error: message }, { status });
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export const OPTIONS = () => new Response(null, { status: 204 });
