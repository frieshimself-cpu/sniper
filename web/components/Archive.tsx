"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Case } from "@/lib/types";
import { SEVERITIES } from "@/lib/types";
import { CaseCard } from "./CaseCard";

const PAGE = 24;

export function matches(c: Case, q: string, severity: string): boolean {
  if (severity && c.severity !== severity) return false;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if (needle.startsWith("$")) return c.token.symbol.toLowerCase().startsWith(needle.slice(1));
  if (needle.startsWith("@")) return c.subjects.some((s) => s.toLowerCase().startsWith(needle));
  const mint = c.token.mint.toLowerCase();
  return (
    mint === needle || mint.startsWith(needle) || c.token.symbol.toLowerCase().includes(needle) || c.token.name.toLowerCase().includes(needle) ||
    c.subjects.some((s) => s.includes(needle)) || c.headline.toLowerCase().includes(needle) || c.id === needle.replace(/^#/, "").padStart(4, "0")
  );
}

function ArchiveInner({ cases }: { cases: Case[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const q = (params.get("q") ?? "").slice(0, 100);
  const severity = params.get("severity") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const all = useMemo(() => cases.filter((c) => matches(c, q, severity)), [cases, q, severity]);
  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  const p = Math.min(pages, page);
  const results = all.slice((p - 1) * PAGE, p * PAGE);
  const link = (n: number) => {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    if (severity) s.set("severity", severity);
    if (n > 1) s.set("page", String(n));
    return `?${s}`;
  };

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = new URLSearchParams();
    const nq = String(f.get("q") ?? "").trim();
    const ns = String(f.get("severity") ?? "");
    if (nq) s.set("q", nq);
    if (ns) s.set("severity", ns);
    router.push(`?${s}`);
  }

  return (
    <>
      <p className="mt-2 text-mute text-xs uppercase tracking-[0.14em]">
        {all.length} cases · newest first{pages > 1 ? ` · page ${p} of ${pages}` : ""}
      </p>
      <form onSubmit={submit} className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto_auto]" role="search">
        <label className="sr-only" htmlFor="q">
          Search by contract address, $symbol or @handle
        </label>
        <input id="q" name="q" className="input" placeholder="CA, $symbol or @handle" defaultValue={q} autoComplete="off" key={q} />
        <label className="sr-only" htmlFor="severity">
          Severity
        </label>
        <select id="severity" name="severity" className="input sm:w-44" defaultValue={severity} key={`s-${severity}`}>
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="submit" className="btn">
          Search
        </button>
      </form>
      {results.length === 0 ? (
        <p className="mt-10 text-mute">Nothing on file.</p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((c) => (
            <CaseCard key={c.n} c={c} />
          ))}
        </div>
      )}
      {pages > 1 ? (
        <nav aria-label="Pages" className="mt-8 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em]">
          {p > 1 ? <a href={link(p - 1)} className="underline">Newer</a> : <span />}
          <span className="text-mute">
            {p} / {pages}
          </span>
          {p < pages ? <a href={link(p + 1)} className="underline">Older</a> : <span />}
        </nav>
      ) : null}
    </>
  );
}

export function Archive({ cases }: { cases: Case[] }) {
  return (
    <Suspense fallback={<p className="mt-2 text-mute text-xs uppercase tracking-[0.14em]">{cases.length} cases · newest first</p>}>
      <ArchiveInner cases={cases} />
    </Suspense>
  );
}
