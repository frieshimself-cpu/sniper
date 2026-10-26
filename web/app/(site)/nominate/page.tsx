import type { Metadata } from "next";
import Link from "next/link";
import { dyn } from "@/lib/request";
import { getBoard } from "@/lib/nominations";
import { ago } from "@/lib/format";
import { Nominate } from "@/components/Nominate";

export const metadata: Metadata = { title: "Nominate" };

export default async function NominatePage() {
  await dyn();
  const board = await getBoard();
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-4xl md:text-5xl">The board</h1>
        <p className="mt-2 text-mute text-xs uppercase tracking-[0.14em]">Who gets investigated next. The four most nominated go on the hour&apos;s ballot.</p>
      </div>
      <div className="grid gap-8 lg:grid-cols-5">
        <div className="file p-5 md:p-6 lg:col-span-2 self-start">
          <h2 className="text-xl mb-4">Nominate a handle</h2>
          <Nominate />
        </div>
        <div className="file p-5 md:p-6 lg:col-span-3">
          <div className="flex items-baseline justify-between border-b-2 border-ink pb-2">
            <h2 className="text-xl">Nominated this week</h2>
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">{board.length} handles</span>
          </div>
          {board.length === 0 ? (
            <p className="mt-4 text-sm">The board is empty. Be first.</p>
          ) : (
            <div className="mt-2 overflow-x-auto -mx-5 px-5">
              <table className="data">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Handle</th>
                    <th>Nominations</th>
                    <th>Last</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {board.slice(0, 50).map((e, i) => (
                    <tr key={e.handle}>
                      <td>{String(i + 1).padStart(2, "0")}</td>
                      <td className="font-semibold">
                        <Link href={`/persons/${e.handle.slice(1)}`} className="underline">
                          {e.handle}
                        </Link>
                      </td>
                      <td>{e.nominations}</td>
                      <td>{ago(e.last)}</td>
                      <td className="whitespace-normal min-w-48 opacity-80">{e.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
