import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminToken, checkPassword } from "@/lib/auth";
import { body, error } from "@/lib/api";


export async function POST(req: Request) {
  const b = await body<{ password?: string }>(req);
  if (!b || typeof b.password !== "string") return error(400, "password required.");
  if (!checkPassword(b.password)) return error(401, "Wrong password.");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, adminToken()!, { httpOnly: true, sameSite: "strict", path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 12 });
  return res;
}
