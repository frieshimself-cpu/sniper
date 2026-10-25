import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-4 py-10">
      <p className="text-[96px] leading-none font-semibold text-stamp">404</p>
      <p className="text-sm">Nothing on file.</p>
      <Link href="/cases" className="btn">
        Archive
      </Link>
    </div>
  );
}
