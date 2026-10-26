import type { Metadata } from "next";
import { dyn } from "@/lib/request";
import Link from "next/link";
import { getPersons } from "@/lib/data";
import { ago } from "@/lib/format";
import { Severity } from "@/components/Pills";

export const metadata: Metadata = { title: "Persons" };

export default async function Persons() {
  await dyn();
  const persons = getPersons();
  return (
    <div>
      <h1 className="text-4xl md:text-5xl">Persons on the record</h1>
      <p className="mt-2 text-mute text-xs uppercase tracking-[0.14em]">Handles only. {persons.length} on file.</p>
      <div className="file mt-8 p-5">
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="data">
            <thead>
              <tr>
                <th>Handle</th>
                <th>Cases</th>
                <th>Findings</th>
                <th>Top severity</th>
                <th>Wallets</th>
                <th>Last seen</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {persons.map((p) => (
                <tr key={p.handle}>
                  <td>
                    <Link href={`/persons/${p.handle.slice(1)}`} className="font-semibold underline">
                      {p.handle}
                    </Link>
                  </td>
                  <td>{p.cases}</td>
                  <td>{p.findings}</td>
                  <td>{p.topSeverity ? <Severity level={p.topSeverity} ink /> : "—"}</td>
                  <td>{p.wallets}</td>
                  <td>{ago(p.lastSeen)}</td>
                  <td className="whitespace-normal">{p.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
