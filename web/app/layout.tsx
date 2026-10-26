import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/anton/400.css";
import "./globals.css";
import { siteUrl } from "@/lib/format";
import { dyn } from "@/lib/request";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "C.R.I.M.E.", template: "%s · C.R.I.M.E." },
  description: "Chain Research & Investigation of Market Exploits. Cases opened. Crimes found. Convictions: 0.",
  openGraph: { siteName: "C.R.I.M.E.", type: "website" },
  alternates: { types: { "application/atom+xml": "/feed.xml" } },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await dyn();
  return (
    <html lang="en">
      <body>
        <div className="aurora" aria-hidden>
          <span className="a1" />
          <span className="a2" />
          <span className="a3" />
        </div>
        <div className="vignette" aria-hidden />
        {children}
        {process.env.VERCEL ? <Analytics /> : null}
      </body>
    </html>
  );
}
