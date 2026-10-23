"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signText } from "./wallet";

export function DisputeButton({ wallet, small = false }: { wallet: string; small?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [note, setNote] = useState<string | null>(null);

  async function dispute() {
    setState("busy");
    setNote(null);
    try {
      const signed = await signText(`CRIME dispute ${wallet}`);
      if (signed.wallet !== wallet) throw new Error("Connect the wallet in question.");
      const r = await fetch("/api/dispute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet, signature: signed.signature }),
      });
      const json = (await r.json()) as { message?: string; error?: string };
      if (!r.ok) throw new Error(json.error ?? "Dispute rejected.");
      setNote(json.message ?? "Noted.");
      setState("done");
      router.refresh();
    } catch (e) {
      setNote((e as Error).message);
      setState("idle");
    }
  }

  return (
    <span className="inline-flex items-center gap-3">
      <button
        type="button"
        className={`btn btn-red ${small ? "px-2 py-1 text-[10px]" : ""}`}
        disabled={state !== "idle"}
        onClick={dispute}
      >
        {state === "busy" ? "Signing" : state === "done" ? "Noted." : "Dispute"}
      </button>
      {note && state !== "done" ? <span className="text-xs text-stamp">{note}</span> : null}
    </span>
  );
}
