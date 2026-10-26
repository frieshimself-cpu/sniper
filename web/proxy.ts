/**
 * The curtain. On the hosts named in COMING_SOON_HOSTS the site shows /coming-soon to everyone
 * who has not unlocked it. Visit any page with ?preview=<PREVIEW_KEY> once: a cookie is set and
 * the full site follows on that host. Every other host (the vercel.app preview) is open as usual.
 * Not part of the static export, which has no curtain and no cookies.
 */
import { NextResponse, type NextRequest } from "next/server";

export const config = {
  // the API, the cards, the feed and the embeddable counter stay open on the curtained host
  matcher: ["/((?!_next/|api/|embed/counter$|cases/.*\\.(?:png|csv)$|feed\\.xml$|.*\\.[a-z0-9]+$).*)"],
};

const COOKIE = "crime_preview";

export function proxy(req: NextRequest) {
  const hosts = (process.env.COMING_SOON_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const host = (req.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  if (!hosts.includes(host)) return NextResponse.next();

  const key = process.env.PREVIEW_KEY ?? "";
  const url = req.nextUrl;
  if (key && url.searchParams.get("preview") === key) {
    const clean = new URL(url.pathname === "/coming-soon" ? "/" : url.pathname, url);
    const res = NextResponse.redirect(clean);
    res.cookies.set(COOKIE, key, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return res;
  }
  if (key && req.cookies.get(COOKIE)?.value === key) return NextResponse.next();
  if (url.pathname === "/coming-soon") return NextResponse.next();
  return NextResponse.rewrite(new URL("/coming-soon", url));
}
