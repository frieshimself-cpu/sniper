import type { Metadata } from "next";
import { dyn } from "@/lib/request";
import { getCases } from "@/lib/data";
import { Archive } from "@/components/Archive";

export const metadata: Metadata = { title: "Cases" };

export default async function Cases() {
  await dyn();
  return (
    <div>
      <h1 className="text-4xl md:text-5xl">Case archive</h1>
      <Archive cases={getCases()} />
    </div>
  );
}
