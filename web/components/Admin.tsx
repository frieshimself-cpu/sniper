"use client";

import { withBase } from "@/lib/dyn";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Candidate } from "@/lib/ballot";
import type { BallotOption, Dispute } from "@/lib/store";
import type { AgentStatus, Lead } from "@/lib/data";

async function post(url: string, body: unknown) {
  const r = await fetch(withBase(url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(json.error ?? `Request failed (${r.status}).`);
  return json;
}

export function AdminLogin() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await post("/api/admin/login", { password: pw });
      router.refresh();
    } catch (x) {
      setErr((x as Error).message);
    }
  }
  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
      <label className="label label-dark" htmlFor="pw">
        Password
      </label>
      <input id="pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
      <button type="submit" className="btn self-start">
        Enter
      </button>
      {err ? (
        <p className="text-xs text-stamp" role="alert">
          {err}
        </p>
      ) : null}
    </form>
  );
}

interface TodayView {
  id: string;
  options: BallotOption[];
  votes: number;
  tally: Record<string, number>;
}

export function AdminPanel({
  candidates,
  size,
  threshold,
  today,
  disputes,
  leads,
  agent,
}: {
  candidates: Candidate[];
  size: number;
  threshold: number;
  today: TodayView | null;
  disputes: Dispute[];
  leads: Lead[];
  agent: AgentStatus;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(today?.options.map((o) => o.key) ?? candidates.slice(0, size).map((c) => c.key));
  const [note, setNote] = useState<string | null>(null);
  const locked = (today?.votes ?? 0) > 0;

  function toggle(key: string) {
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : p.length < size ? [...p, key] : p));
  }

  async function build() {
    setNote(null);
    try {
      await post("/api/admin/ballot", { keys: picked });
      setNote("Ballot built.");
      router.refresh();
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  async function review(wallet: string, status: "removed" | "kept") {
    setNote(null);
    try {
      await post("/api/admin/dispute", { wallet, status });
      router.refresh();
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  async function reviewLead(id: string, status: "approved" | "rejected") {
    setNote(null);
    try {
      await post("/api/admin/lead", { id, status });
      router.refresh();
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  async function logout() {
    await post("/api/admin/logout", {});
    router.refresh();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
      <section className="file p-5 md:p-6">
        <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-2">
          <h2 className="text-xl">Today&apos;s ballot</h2>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">{today ? `${today.id} · ${today.votes} votes` : "not built"}</span>
        </div>
        <p className="mt-3 text-xs opacity-80">
          Pick up to {size}, at least 2. Eligible: tokens with score at or above {threshold}, and registry handles. Nothing that was on a ballot in the last 30 days.
          Yesterday&apos;s runner-up is carried.
        </p>
        {locked ? <p className="mt-2 text-xs text-stamp">Votes are in. Today&apos;s ballot is locked.</p> : null}
        <ul className="mt-4 flex flex-col gap-2 max-h-96 overflow-y-auto">
          {candidates.map((c) => (
            <li key={c.key}>
              <label className="flex items-center gap-3 text-[13px] cursor-pointer">
                <input type="checkbox" checked={picked.includes(c.key)} onChange={() => toggle(c.key)} disabled={locked} />
                <span className="font-semibold">{c.label}</span>
                <span className="text-[10px] uppercase tracking-[0.12em] opacity-75">
                  {c.kind}
                  {c.kind === "token" ? ` · score ${c.score}` : ""}
                  {c.carried ? " · carried" : ""}
                </span>
              </label>
            </li>
          ))}
          {candidates.length === 0 ? <li className="text-sm">No eligible subjects.</li> : null}
        </ul>
        <div className="mt-4 flex items-center gap-4">
          <button type="button" className="btn btn-solid" disabled={locked || picked.length < 2 || picked.length > size} onClick={build}>
            Build ballot ({picked.length}/{size})
          </button>
          {today ? (
            <span className="text-xs">
              {today.options.map((o) => `${o.label} ${today.tally[o.key] ?? 0}`).join(" · ")}
            </span>
          ) : null}
        </div>
      </section>

      <section className="file p-5 md:p-6">
        <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-2">
          <h2 className="text-xl">Disputes</h2>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">{disputes.filter((d) => d.status === "open").length} open</span>
        </div>
        <p className="mt-3 text-xs opacity-80">Every disputed wallet is already hidden. Review decides whether the registry entry was wrong. Registry edits happen in the agent repo.</p>
        {disputes.length === 0 ? (
          <p className="mt-4 text-sm">None.</p>
        ) : (
          <div className="mt-4 overflow-x-auto -mx-5 px-5">
            <table className="data">
              <thead>
                <tr>
                  <th>Wallet</th>
                  <th>Filed</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {disputes.map((d) => (
                  <tr key={d.wallet}>
                    <td className="break-all whitespace-normal">{d.wallet}</td>
                    <td>{d.at.slice(0, 16).replace("T", " ")}</td>
                    <td className="uppercase font-semibold">{d.status}</td>
                    <td>
                      {d.status === "open" ? (
                        <span className="flex gap-2">
                          <button type="button" className="btn px-2 py-1 text-[10px]" onClick={() => review(d.wallet, "removed")}>
                            Remove entry
                          </button>
                          <button type="button" className="btn px-2 py-1 text-[10px]" onClick={() => review(d.wallet, "kept")}>
                            Source stands
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="file p-5 md:p-6 lg:col-span-2">
        <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-2">
          <h2 className="text-xl">Attribution leads</h2>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">
            agent {agent.state} · {agent.mode} · {leads.filter((l) => l.status === "open").length} open
          </span>
        </div>
        <p className="mt-3 text-xs opacity-80">
          Wallet-to-handle links the investigator found but could not source well enough to publish on its own. Approve writes the wallet to the
          registry with the source shown. Reject drops it. {agent.message ? `Last run: ${agent.message}` : ""}
        </p>
        {leads.length === 0 ? (
          <p className="mt-4 text-sm">None.</p>
        ) : (
          <div className="mt-4 overflow-x-auto -mx-5 px-5">
            <table className="data">
              <thead>
                <tr>
                  <th>Handle</th>
                  <th>Wallet</th>
                  <th>Tier</th>
                  <th>Source</th>
                  <th>Reason</th>
                  <th>Case</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td className="font-semibold">{l.handle}</td>
                    <td>{l.address.slice(0, 6)}…{l.address.slice(-4)}</td>
                    <td className="uppercase">{l.tier}</td>
                    <td>
                      <a href={l.source} target="_blank" rel="noopener noreferrer" className="underline">
                        {l.source.replace(/^https?:\/\//, "").slice(0, 32)}
                      </a>
                    </td>
                    <td className="whitespace-normal min-w-56">{l.reason}</td>
                    <td>{l.case_n ? `No. ${String(l.case_n).padStart(4, "0")}` : "—"}</td>
                    <td className="uppercase font-semibold">{l.status}</td>
                    <td>
                      {l.status === "open" ? (
                        <span className="flex gap-2">
                          <button type="button" className="btn px-2 py-1 text-[10px]" onClick={() => reviewLead(l.id, "approved")}>
                            Approve
                          </button>
                          <button type="button" className="btn px-2 py-1 text-[10px]" onClick={() => reviewLead(l.id, "rejected")}>
                            Reject
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="lg:col-span-2 flex items-center gap-4">
        <button type="button" className="btn" onClick={logout}>
          Log out
        </button>
        {note ? (
          <span className="text-xs" role="status">
            {note}
          </span>
        ) : null}
      </div>
    </div>
  );
}
