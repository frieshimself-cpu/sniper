"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signText } from "./wallet";
import { STATIC, withBase } from "@/lib/dyn";

export function Nominate() {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (STATIC) throw new Error("Nominations need the full site.");
      const h = "@" + handle.trim().replace(/^@/, "").toLowerCase();
      const { wallet, signature } = await signText(`CRIME nominate ${h}`);
      const r = await fetch(withBase("/api/nominate"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle: h, wallet, signature, note }) });
      const j = (await r.json()) as { error?: string; message?: string };
      if (!r.ok) throw new Error(j.error ?? "Rejected.");
      setMsg(j.message ?? "Noted.");
      setHandle("");
      setNote("");
      router.refresh();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="label" htmlFor="nom-handle">
        Handle
      </label>
      <input id="nom-handle" className="input input-ink" placeholder="@handle" value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={16} required />
      <label className="label" htmlFor="nom-note">
        Why, in one line (optional)
      </label>
      <input id="nom-note" className="input input-ink" placeholder="Shilled $X, sold the top." value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} />
      <button type="submit" className="btn btn-solid self-start" disabled={busy || handle.trim().length < 2}>
        {busy ? "Signing" : "Nominate"}
      </button>
      <p className="text-xs opacity-70">You sign <code>CRIME nominate &lt;handle&gt;</code> with your wallet. Nothing on-chain. One nomination per wallet per handle per day.</p>
      {msg ? (
        <p className="text-xs" role="status">
          {msg}
        </p>
      ) : null}
    </form>
  );
}
