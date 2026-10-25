// Injected by scripts/build-static.sh for the export only. Not part of the server build.
import { caseParams } from "@/lib/api";

export const generateStaticParams = caseParams;
export const dynamicParams = false;

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
