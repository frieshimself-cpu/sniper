export function Pill({ children, red = false, ink = false }: { children: React.ReactNode; red?: boolean; ink?: boolean }) {
  return (
    <span className={`pill ${ink ? "pill-ink" : ""} ${red ? "pill-red" : ""}`}>
      <span className="pill-dot" aria-hidden />
      {children}
    </span>
  );
}

export function Severity({ level, ink = false }: { level: string; ink?: boolean }) {
  const red = level === "high" || level === "critical";
  return (
    <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${red ? "text-stamp" : ink ? "text-ink" : "text-manila"}`}>
      {level}
    </span>
  );
}
