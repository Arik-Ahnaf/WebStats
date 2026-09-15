import { addDays, localDate } from './dates';
import type { Period, UsageRecord } from '../shared/types';

export interface DateRange { start: Date; end: Date; dates: string[]; label: string }
export interface RankedSite { hostname: string; durationMs: number; visits: number; percentage: number }
export interface Report { range: DateRange; sites: RankedSite[]; days: { date: string; durationMs: number }[]; totalMs: number }

export function periodRange(period: Period, now: number, offset = 0): DateRange {
  const today = new Date(now);
  let start: Date;
  let end: Date;
  if (period === 'week') {
    start = addDays(today, -((today.getDay() + 6) % 7) + offset * 7);
    end = addDays(start, 7);
  } else {
    start = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  }
  const dates: string[] = [];
  for (let day = start; day < end; day = addDays(day, 1)) dates.push(localDate(day));
  const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const label = period === 'month'
    ? start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : `${formatter.format(start)} – ${formatter.format(addDays(end, -1))}, ${start.getFullYear()}`;
  return { start, end, dates, label };
}

export function rankSites(records: UsageRecord[]): RankedSite[] {
  const bySite = new Map<string, Omit<RankedSite, 'percentage'>>();
  for (const record of records) {
    const current = bySite.get(record.hostname) ?? { hostname: record.hostname, durationMs: 0, visits: 0 };
    current.durationMs += record.durationMs;
    current.visits += record.visits;
    bySite.set(record.hostname, current);
  }
  const total = [...bySite.values()].reduce((sum, site) => sum + site.durationMs, 0);
  return [...bySite.values()]
    .filter(site => site.durationMs > 0 || site.visits > 0)
    .sort((a, b) => b.durationMs - a.durationMs || a.hostname.localeCompare(b.hostname))
    .map(site => ({ ...site, percentage: total ? site.durationMs / total * 100 : 0 }));
}

export function buildReport(records: UsageRecord[], period: Period, now: number, offset = 0): Report {
  const range = periodRange(period, now, offset);
  const dates = new Set(range.dates);
  const filtered = records.filter(record => dates.has(record.date));
  const byDay = new Map<string, number>();
  for (const record of filtered) byDay.set(record.date, (byDay.get(record.date) ?? 0) + record.durationMs);
  const days = range.dates.map(date => ({ date, durationMs: byDay.get(date) ?? 0 }));
  return { range, sites: rankSites(filtered), days, totalMs: days.reduce((sum, day) => sum + day.durationMs, 0) };
}

export function formatDuration(durationMs: number, seconds = false): string {
  const total = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return seconds ? `${minutes}m ${total % 60}s` : `${minutes}m`;
  return `${total}s`;
}
