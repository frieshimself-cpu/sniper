import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-[96px] leading-none font-semibold text-stamp">404</p>
      <p className="text-sm">Nothing on file.</p>
      <Link href="/" className="btn">
        Home
      </Link>
    </div>
  );
}
