import type { Metadata } from "next";
import { Glitch } from "@/components/Glitch";
import { siteUrl } from "@/lib/format";

export const metadata: Metadata = {
  title: "CRIME IS LEGAL",
  description: "Chain Research & Investigation of Market Exploits. Cases opened soon. Convictions: 0.",
  openGraph: { images: [{ url: `${siteUrl()}/brand/og.jpg`, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", images: [`${siteUrl()}/brand/og.jpg`] },
};

/** The curtain. Black, the knife, the words. */
export default function ComingSoon() {
  return (
    <div className="curtain min-h-screen flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-10 gap-7 sm:gap-9">
        <Glitch src="/brand/knife.png" alt="A hand holding a knife, drawn in a blue and red outline" width={400} height={400} priority className="w-[200px] sm:w-[240px] md:w-[280px]" />
        <Glitch src="/brand/wordmark.png" alt="CRIME IS LEGAL" width={1500} height={500} priority className="w-full max-w-[640px]" />
        <p className="ticker">
          coming soon · cases <b>hourly</b> · convictions <b className="red">0</b>
        </p>
        <a href="https://x.com/crimeislegalpf" target="_blank" rel="noopener noreferrer" className="btn">
          @crimeislegalpf
        </a>
      </main>
      <footer className="px-6 py-5 text-center ticker opacity-70">chain research &amp; investigation of market exploits</footer>
    </div>
  );
}
