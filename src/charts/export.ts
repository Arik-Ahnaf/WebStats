import { formatDuration } from '../analytics/reports';
import type { Report } from '../analytics/reports';
import { parseLocalDate } from '../analytics/dates';

export const CHART_COLORS = { background: '#141023', text: '#E0DCEF', violet: '#6650AF', grid: '#3D3069', bar: '#a893e2' };

export function chartUnit(report: Report): { divisor: number; label: string } {
  const maximum = Math.max(...report.days.map(day => day.durationMs), 0);
  if (maximum < 60_000) return { divisor: 1_000, label: 'Seconds' };
  return maximum >= 7_200_000
    ? { divisor: 3_600_000, label: 'Hours' } : { divisor: 60_000, label: 'Minutes' };
}

export function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!);
}

/** Standalone, scalable chart with explicit styling; no fonts, CSS or network dependencies. */
export function createChartSvg(report: Report): string {
  const { divisor, label } = chartUnit(report);
  const width = 1000, height = 620, left = 88, top = 140, plotWidth = 860, plotHeight = 330;
  const maximum = Math.max(1, ...report.days.map(day => day.durationMs / divisor));
  const scale = Math.pow(10, Math.floor(Math.log10(maximum)));
  const ceiling = Math.ceil(maximum / scale) * scale;
  const y = (value: number) => top + plotHeight - value / ceiling * plotHeight;
  const text = (x: number, yy: number, value: string, extra = '') =>
    `<text x="${x}" y="${yy}" ${extra}>${escapeXml(value)}</text>`;
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = ceiling * index / 4;
    return `<line x1="${left}" x2="${left + plotWidth}" y1="${y(value)}" y2="${y(value)}" stroke="${CHART_COLORS.grid}"/>` +
      text(left - 14, y(value) + 5, Number(value.toFixed(2)).toString(), 'text-anchor="end" font-size="15"');
  }).join('');
  const step = plotWidth / report.days.length;
  const bars = report.days.map((day, index) => {
    const value = day.durationMs / divisor;
    const x = left + index * step;
    const date = parseLocalDate(day.date);
    const showTick = report.days.length <= 7 || index % 5 === 0 || index === report.days.length - 1;
    return `<rect x="${x + step * .18}" y="${y(value)}" width="${step * .64}" height="${value / ceiling * plotHeight}" rx="3" fill="${CHART_COLORS.bar}"><title>${escapeXml(`${day.date}: ${formatDuration(day.durationMs, true)}`)}</title></rect>` +
      (showTick ? text(x + step / 2, top + plotHeight + 30,
        date.toLocaleDateString('en', report.days.length <= 7 ? { weekday: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' }),
        'text-anchor="middle" font-size="14"') : '');
  }).join('');
  const topSite = report.sites[0];
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
<title id="title">WebStats — ${escapeXml(report.range.label)}</title>
<desc id="description">Daily active website usage in ${label.toLowerCase()}. Total: ${formatDuration(report.totalMs)}. Generated locally.</desc>
<rect width="${width}" height="${height}" rx="16" fill="${CHART_COLORS.background}"/>
<g fill="${CHART_COLORS.text}" font-family="IBM Plex Sans, Arial, sans-serif">
${text(40, 54, 'WebStats', 'font-size="34" font-weight="700"')}
${text(40, 86, report.range.label, 'font-size="19"')}
${text(948, 54, `${formatDuration(report.totalMs)} total`, 'text-anchor="end" font-size="22"')}
${text(left, 123, label, 'font-size="14"')}
${grid}${bars}
${text(40, 555, topSite ? `Most visited by time: ${topSite.hostname} · ${formatDuration(topSite.durationMs)}` : 'No activity recorded in this period.', 'font-size="17"')}
${text(40, 592, 'Active, focused browsing only · Stored on your device · webstats', 'font-size="14"')}
</g></svg>`;
}

export function downloadChart(report: Report): void {
  const url = URL.createObjectURL(new Blob([createChartSvg(report)], { type: 'image/svg+xml;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `webstats-${report.range.dates[0]}-${report.range.dates.at(-1)}.svg`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
