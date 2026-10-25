import type { Metadata } from "next";
import { getCases } from "@/lib/data";
import { Archive } from "@/components/Archive";

export const metadata: Metadata = { title: "Cases" };

export default function Cases() {
  return (
    <div>
      <h1 className="text-4xl md:text-5xl">Case archive</h1>
      <Archive cases={getCases()} />
    </div>
  );
}
