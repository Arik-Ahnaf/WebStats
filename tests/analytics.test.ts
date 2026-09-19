import { describe, expect, it } from 'vitest';
import { addDays, localDate, splitAtMidnight } from '../src/analytics/dates';
import { buildReport, formatDuration, periodRange, rankSites } from '../src/analytics/reports';
import { normalizeHostname } from '../src/tracking/domain';
import { siteNameFromHostname } from '../src/ui/site-name';
import { chartUnit, createChartSvg, escapeXml } from '../src/charts/export';
import type { UsageRecord } from '../src/shared/types';

describe('privacy boundary', () => {
  it.each(['chrome://settings', 'edge://settings', 'about:blank', 'file:///tmp/private', 'devtools://devtools', 'chrome-extension://abc/popup.html', 'data:text/html,test', 'ftp://example.com', 'invalid'])('excludes %s', url => {
    expect(normalizeHostname(url)).toBeNull();
  });
  it('normalizes the hostname and discards credentials, ports, paths, search and hash', () => {
    expect(normalizeHostname('https://user:password@EXAMPLE.com.:8443/private?q=secret#form')).toBe('example.com');
  });
  it('preserves subdomains, IP addresses, localhost and ASCII internationalized hostnames', () => {
    expect(normalizeHostname('http://localhost:8000/a')).toBe('localhost');
    expect(normalizeHostname('http://127.0.0.1:8080/')).toBe('127.0.0.1');
    expect(normalizeHostname('https://www.example.com')).toBe('www.example.com');
    expect(normalizeHostname('https://bücher.de')).toBe('xn--bcher-kva.de');
  });
});

describe('compact site labels', () => {
  it.each([
    ['10minuteschool.com', '10minuteschool'],
    ['open.spotify.com', 'spotify'],
    ['www.example.com', 'example'],
    ['news.bbc.co.uk', 'bbc'],
    ['localhost', 'localhost'],
    ['127.0.0.1', '127.0.0.1'],
    ['2001:db8::1', '2001:db8::1'],
  ])('displays %s as %s', (hostname, name) => {
    expect(siteNameFromHostname(hostname)).toBe(name);
  });
});

describe('local calendar boundaries', () => {
  it('uses local dates instead of UTC dates', () => {
    expect(localDate(new Date('2026-09-16T02:00:00Z'))).toBe('2026-09-15');
  });
  it('handles the 23-hour spring-forward day', () => {
    const start = new Date(2026, 2, 8);
    const end = addDays(start, 1);
    expect(end.getTime() - start.getTime()).toBe(23 * 3_600_000);
    expect(splitAtMidnight(start.getTime(), end.getTime())).toEqual([{ date: '2026-03-08', durationMs: 23 * 3_600_000 }]);
  });
  it('handles the 25-hour fall-back day', () => {
    const start = new Date(2026, 10, 1);
    expect(splitAtMidnight(start.getTime(), addDays(start, 1).getTime())).toEqual([{ date: '2026-11-01', durationMs: 25 * 3_600_000 }]);
  });
  it('splits across month and year boundaries and ignores nonpositive intervals', () => {
    const start = new Date(2026, 11, 31, 23, 59, 59).getTime();
    expect(splitAtMidnight(start, start + 2000).map(row => row.date)).toEqual(['2026-12-31', '2027-01-01']);
    expect(splitAtMidnight(start, start - 1)).toEqual([]);
  });
});

describe('reports', () => {
  const now = new Date(2026, 8, 15, 12).getTime();
  const records: UsageRecord[] = [
    { date: '2026-09-14', hostname: 'a.test', durationMs: 30_000, visits: 1 },
    { date: '2026-09-15', hostname: 'a.test', durationMs: 30_000, visits: 1 },
    { date: '2026-09-15', hostname: 'b.test', durationMs: 60_000, visits: 1 },
    { date: '2026-09-01', hostname: 'b.test', durationMs: 120_000, visits: 1 },
    { date: '2026-08-31', hostname: 'old.test', durationMs: 99_000, visits: 1 },
  ];
  it('aggregates Monday–Sunday weeks with zero-filled days', () => {
    const report = buildReport(records, 'week', now);
    expect(report.range.dates).toHaveLength(7);
    expect(report.range.dates[0]).toBe('2026-09-14');
    expect(report.range.dates.at(-1)).toBe('2026-09-20');
    expect(report.totalMs).toBe(120_000);
    expect(report.sites.map(site => site.percentage)).toEqual([50, 50]);
    expect(report.days.at(-1)?.durationMs).toBe(0);
  });
  it('aggregates calendar months, excluding neighboring dates', () => {
    const report = buildReport(records, 'month', now);
    expect(report.days).toHaveLength(30);
    expect(report.totalMs).toBe(240_000);
    expect(report.sites[0]).toMatchObject({ hostname: 'b.test', durationMs: 180_000, percentage: 75, visits: 2 });
  });
  it('handles leap years, Sunday starts and previous periods across years', () => {
    expect(periodRange('month', new Date(2024, 1, 15).getTime()).dates).toHaveLength(29);
    expect(periodRange('month', new Date(2026, 0, 31).getTime(), -1).dates[0]).toBe('2025-12-01');
    expect(periodRange('week', new Date(2026, 8, 20).getTime()).dates[0]).toBe('2026-09-14');
  });
  it('supports many sites and zero-duration visits without NaN percentages', () => {
    const many = Array.from({ length: 500 }, (_, index) => ({ hostname: `site${index}.test`, date: '2026-09-15', durationMs: index, visits: 1 }));
    expect(rankSites(many)).toHaveLength(500);
    expect(rankSites([{ ...many[0]!, durationMs: 0 }])[0]?.percentage).toBe(0);
    expect(buildReport([], 'month', now).totalMs).toBe(0);
  });
  it('formats useful units', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(3_723_000)).toBe('1h 2m');
    expect(formatDuration(62_000, true)).toBe('1m 2s');
  });
  it('exports a standalone, accessible SVG with real chart values', () => {
    const svg = createChartSvg(buildReport(records, 'week', now));
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('2026-09-15: 1m 30s');
    expect(svg).toContain('aria-labelledby="title description"');
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('NaN');
    expect(escapeXml('<&"\'')).toBe('&lt;&amp;&quot;&apos;');
    expect(createChartSvg(buildReport([], 'month', now))).toContain('No activity recorded');
  });
  it('uses seconds for brief activity and larger units for longer days', () => {
    expect(chartUnit(buildReport([{ ...records[0]!, durationMs: 1000 }], 'week', now)).label).toBe('Seconds');
    expect(chartUnit(buildReport(records, 'week', now)).label).toBe('Minutes');
    expect(chartUnit(buildReport([{ ...records[0]!, durationMs: 9_000_000 }], 'week', now)).label).toBe('Hours');
  });
});
