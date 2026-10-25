// Injected by scripts/build-static.sh for the export only. Not part of the server build.
import { handleParams } from "@/lib/api";

export const generateStaticParams = handleParams;
export const dynamicParams = false;

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
