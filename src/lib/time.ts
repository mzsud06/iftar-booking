const TZ = "Europe/London";

export function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, weekday: "short", day: "numeric", month: "short",
  }).format(new Date(iso));
}

export function fmtDayLong(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long",
  }).format(new Date(iso));
}

export function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

export function fmtDateTime(iso: string): string {
  return `${fmtDate(iso)}, ${fmtTime(iso)}`;
}

// A plain date column (YYYY-MM-DD) shown as "Mon 8 Feb".
export function fmtPlainDate(d: string): string {
  return fmtDate(`${d}T12:00:00Z`);
}

export function hoursBefore(iso: string, hours: number): Date {
  return new Date(new Date(iso).getTime() - hours * 3600_000);
}

export function countdown(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

export function shortCode(c: string): string {
  return c.length === 6 ? `${c.slice(0, 3)}-${c.slice(3)}` : c;
}

// "2026-10-12" for a timestamp, in London time (for date inputs).
export function londonDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
