import type { MetaStatus } from "./envelope";

type ComputeStatusParams = {
  marketClosed?: boolean;
  dataDate?: string | null;
  now?: Date;
  maxStaleDays?: number;
  pendingWindowMinutes?: number;
  warnings?: string[];
};

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toUtcDay(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function diffDays(fromDay: string, toDay: string): number {
  const from = Date.UTC(
    Number(fromDay.slice(0, 4)),
    Number(fromDay.slice(5, 7)) - 1,
    Number(fromDay.slice(8, 10))
  );
  const to = Date.UTC(
    Number(toDay.slice(0, 4)),
    Number(toDay.slice(5, 7)) - 1,
    Number(toDay.slice(8, 10))
  );
  return Math.floor((to - from) / 86400000);
}

function minutesSinceUtcMidnight(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

export function computeStatus(params: ComputeStatusParams): MetaStatus {
  const now = params.now ?? new Date();
  const maxStaleDays = Number.isFinite(params.maxStaleDays) ? Number(params.maxStaleDays) : 14;
  const pendingWindowMinutes = Number.isFinite(params.pendingWindowMinutes)
    ? Number(params.pendingWindowMinutes)
    : 120;

  const today = isoDay(now);
  const dataDate = toUtcDay(params.dataDate);

  if (params.marketClosed) {
    if (!dataDate && params.warnings) {
      params.warnings.push("DATA_DATE_UNKNOWN");
    }
    return "closed";
  }

  if (dataDate && dataDate === today) return "fresh";

  const minutesToday = minutesSinceUtcMidnight(now);
  if (!dataDate && minutesToday <= pendingWindowMinutes) return "pending";
  if (dataDate) {
    const age = diffDays(dataDate, today);
    if (age === 1 && minutesToday <= pendingWindowMinutes) return "pending";
    if (age <= maxStaleDays) return "stale";
    return "error";
  }

  return "error";
}
