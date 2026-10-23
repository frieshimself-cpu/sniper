import type { Metadata } from "next";
import { searchCases } from "@/lib/data";
import { SEVERITIES } from "@/lib/types";
import { enforce } from "@/lib/policy";
import { CaseCard } from "@/components/CaseCard";

export const metadata: Metadata = { title: "Cases" };

export default async function Cases({ searchParams }: { searchParams: Promise<{ q?: string; severity?: string }> }) {
  const params = await searchParams;
  const q = enforce(params.q ?? "").slice(0, 100);
  const severity = params.severity ?? "";
  const results = searchCases({ q, severity });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl">Case archive</h1>
          <p className="mt-2 text-mute text-xs uppercase tracking-[0.14em]">{results.length} cases · newest first</p>
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
    </div>
  );
}
