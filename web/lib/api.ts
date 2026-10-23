import { NextResponse } from "next/server";
import { enforceDeep } from "./policy";

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
