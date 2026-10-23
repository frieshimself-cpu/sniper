import type { Metadata } from "next";
import { StampStudio } from "@/components/StampStudio";

export const metadata: Metadata = { title: "Stamp" };

export default function StampPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-4xl md:text-5xl">Stamp it</h1>
        <p className="mt-2 text-mute text-xs uppercase tracking-[0.14em]">Upload an image. Drag the stamp. Rotate. Download. Nothing leaves your browser.</p>
      </div>
      <StampStudio />
    </div>
  );
}
