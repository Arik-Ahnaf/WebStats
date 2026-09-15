export function localDate(timestamp: number | Date): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseLocalDate(value: string): Date {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Calendar arithmetic, not 24-hour arithmetic: local days may have 23 or 25 hours. */
export function addDays(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
}

export function splitAtMidnight(start: number, end: number): { date: string; durationMs: number }[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const pieces: { date: string; durationMs: number }[] = [];
  let cursor = start;
  while (cursor < end) {
    const boundary = addDays(new Date(cursor), 1).getTime();
    const until = Math.min(end, boundary);
    pieces.push({ date: localDate(cursor), durationMs: until - cursor });
    cursor = until;
  }
  return pieces;
}
