import type { Metadata } from "next";
import { siteUrl } from "@/lib/format";
import { getStats } from "@/lib/data";
import { withBase } from "@/lib/dyn";

export const metadata: Metadata = { title: "Embed" };

export default function Embed() {
  const base = siteUrl();
  const stats = getStats();
  const snippet = `<iframe src="${base}/embed/counter" width="600" height="160" style="border:0;background:#0e0e10" title="C.R.I.M.E. counter" loading="lazy"></iframe>`;
  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      <div>
        <h1 className="text-4xl md:text-5xl">Embed the counter</h1>
        <p className="mt-2 text-mute text-xs uppercase tracking-[0.14em]">600 × 160 · updates itself · no tracking</p>
      </div>
      <div className="overflow-x-auto">
        <iframe src={withBase("/embed/counter")} width={600} height={160} style={{ border: 0, background: "#0e0e10" }} title="C.R.I.M.E. counter preview" />
      </div>
      <section className="file p-5 md:p-8">
        <h2 className="text-xl">Snippet</h2>
        <pre className="mt-3 overflow-x-auto text-xs whitespace-pre-wrap break-all">{snippet}</pre>
      </section>
      <section className="file p-5 md:p-8">
        <h2 className="text-xl">API</h2>
        <p className="mt-2 text-sm">All endpoints are JSON, read-only unless marked, no key, CORS open. Every string has been through the policy.</p>
        <dl className="mt-4 flex flex-col gap-4 text-[13px]">
          <div>
            <dt className="font-semibold">GET /api/stats</dt>
            <dd className="opacity-80">The counter. Cached for 15 seconds.</dd>
            <dd>
              <pre className="mt-2 overflow-x-auto text-xs">{JSON.stringify(stats, null, 2)}</pre>
            </dd>
          </div>
          <div>
            <dt className="font-semibold">GET /api/cases?q=&amp;severity=</dt>
            <dd className="opacity-80">The archive, newest first. q matches a CA, $symbol or @handle.</dd>
          </div>
          <div>
            <dt className="font-semibold">GET /api/cases/:n</dt>
            <dd className="opacity-80">One case with findings, evidence, money trail and narrative. The card is at /cases/:n/card.png, the evidence at /cases/:n/evidence.csv.</dd>
          </div>
          <div>
            <dt className="font-semibold">GET /api/persons/:handle</dt>
            <dd className="opacity-80">A dossier. Wallets appear only with a registry source and only until disputed.</dd>
          </div>
          <div>
            <dt className="font-semibold">GET /api/poll</dt>
            <dd className="opacity-80">The poll on the block, read from X, and the settled ones with the case each winner became.</dd>
          </div>
          <div>
            <dt className="font-semibold">GET /api/progress</dt>
            <dd className="opacity-80">The investigation under way: every step as the agent reports it, the wallets as they are found, the findings as they are weighed.</dd>
          </div>
          <div>
            <dt className="font-semibold">POST /api/dispute</dt>
            <dd className="opacity-80">
              <code>{`{ wallet, signature }`}</code> over <code>CRIME dispute &lt;wallet&gt;</code>. Hides the wallet immediately. Returns &quot;Noted.&quot;
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
