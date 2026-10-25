import type { Metadata } from "next";
import { getStats } from "@/lib/data";
import { Counter } from "@/components/Counter";
import { withBase } from "@/lib/dyn";

export const metadata: Metadata = { title: "Counter", robots: { index: false } };

export default function EmbedCounter() {
  const stats = getStats();
  return (
    <div className="w-[600px] h-[160px] max-w-full px-5 py-4 flex flex-col justify-between overflow-hidden bg-page">
      <Counter initial={stats} compact poll={30_000} />
      <div className="flex justify-between text-[10px] uppercase tracking-[0.14em] text-mute">
        <span>C.R.I.M.E.</span>
        <a href={withBase("/")} target="_blank" rel="noopener noreferrer" className="hover:text-manila">
          crime
        </a>
      </div>
    </div>
  );
}
