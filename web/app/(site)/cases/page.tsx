import type { Metadata } from "next";
import { searchCases } from "@/lib/data";
import { SEVERITIES } from "@/lib/types";
import { enforce } from "@/lib/policy";
import Link from "next/link";
import { CaseCard } from "@/components/CaseCard";

const PAGE = 24;

export const metadata: Metadata = { title: "Cases" };

export default async function Cases({ searchParams }: { searchParams: Promise<{ q?: string; severity?: string; page?: string }> }) {
  const params = await searchParams;
  const q = enforce(params.q ?? "").slice(0, 100);
  const severity = params.severity ?? "";
  const all = searchCases({ q, severity });
  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number(params.page) || 1));
  const results = all.slice((page - 1) * PAGE, page * PAGE);
  const link = (p: number) => `/cases?${new URLSearchParams({ ...(q ? { q } : {}), ...(severity ? { severity } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl">Case archive</h1>
          <p className="mt-2 text-mute text-xs uppercase tracking-[0.14em]">{all.length} cases · newest first{pages > 1 ? ` · page ${page} of ${pages}` : ""}</p>
        </div>
      </div>
      <form method="get" className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto_auto]" role="search">
        <label className="sr-only" htmlFor="q">
          Search by contract address, $symbol or @handle
        </label>
        <input id="q" name="q" className="input" placeholder="CA, $symbol or @handle" defaultValue={q} autoComplete="off" />
        <label className="sr-only" htmlFor="severity">
          Severity
        </label>
        <select id="severity" name="severity" className="input sm:w-44" defaultValue={severity}>
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
          {page > 1 ? <Link href={link(page - 1)} className="underline">Newer</Link> : <span />}
          <span className="text-mute">
            {page} / {pages}
          </span>
          {page < pages ? <Link href={link(page + 1)} className="underline">Older</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
