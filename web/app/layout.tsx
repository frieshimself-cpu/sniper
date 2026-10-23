import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "./globals.css";
import { siteUrl } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "C.R.I.M.E.", template: "%s · C.R.I.M.E." },
  description: "Chain Research & Investigation of Market Exploits. Cases opened. Crimes found. Convictions: 0.",
  openGraph: { siteName: "C.R.I.M.E.", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#0e0e10", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
