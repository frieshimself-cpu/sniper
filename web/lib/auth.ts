import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "crime_admin";

function password(): string | null {
  const p = process.env.ADMIN_PASSWORD?.trim();
  return p ? p : null;
}

export function adminConfigured(): boolean {
  return password() !== null;
}

export function adminToken(): string | null {
  const p = password();
  return p ? createHmac("sha256", p).update("crime-admin-session").digest("hex") : null;
}

export function checkPassword(candidate: string): boolean {
  const p = password();
  if (!p) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(p);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function tokenValid(token: string | undefined): boolean {
  const expected = adminToken();
  if (!expected || !token || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return tokenValid(jar.get(ADMIN_COOKIE)?.value);
}
