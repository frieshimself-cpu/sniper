"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A nav item that knows when it is the current page. */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname() ?? "";
  const current = path === href || (href !== "/" && path.startsWith(href + "/"));
  return (
    <Link href={href} className="nav-link no-underline" aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
