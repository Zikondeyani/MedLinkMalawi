/* Shared formatting helpers */

export function mwk(n: number): string {
  return "MWK " + n.toLocaleString("en-MW");
}

export function mwkCompact(n: number): string {
  if (n >= 1_000_000) return "MWK " + (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + "M";
  if (n >= 1_000) return "MWK " + (n / 1_000).toFixed(0) + "K";
  return mwk(n);
}

export function prettyDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function timeOnly(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hourCycle: "h12" });
}

export function prettyDateTime(iso: string): string {
  const date = prettyDate(iso);
  const time = timeOnly(iso);
  return date === "—" || time === "—" ? "—" : `${date} at ${time}`;
}

export function daysAgoLabel(iso: string): string {
  const d = new Date(iso).getTime();
  const diffDays = Math.round((Date.now() - d) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

/** Deterministic pseudo-random from a string, used for artwork variants. */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}