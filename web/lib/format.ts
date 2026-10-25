export const short = (addr: string, n = 4) => (addr.length > n * 2 + 1 ? `${addr.slice(0, n)}…${addr.slice(-n)}` : addr);

export const solscanTx = (sig: string) => `https://solscan.io/tx/${sig}`;
export const solscanAccount = (addr: string) => `https://solscan.io/account/${addr}`;
export const solscanToken = (mint: string) => `https://solscan.io/token/${mint}`;

export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function until(iso: string | null, now = Date.now()): string {
  if (!iso) return "unscheduled";
  const s = Math.floor((Date.parse(iso) - now) / 1000);
  if (s <= 0) return "due";
  const m = Math.floor(s / 60);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `in ${h}h ${m % 60}m` : `in ${Math.floor(h / 24)}d`;
}

export const date = (iso: string) => iso.slice(0, 10);
export const time = (iso: string) => iso.slice(11, 16) + "Z";

export function siteUrl(): string {
  return (process.env.SITE_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
}

export const num = (n: number) => n.toLocaleString("en-US");
