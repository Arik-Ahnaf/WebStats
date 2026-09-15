import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Report } from '../../analytics/reports';
import { formatDuration } from '../../analytics/reports';
import { parseLocalDate } from '../../analytics/dates';
import { CHART_COLORS, chartUnit } from '../../charts/export';

export function UsageChart({ report }: { report: Report }) {
  const unit = chartUnit(report);
  const days = report.days.map(day => ({ ...day, amount: day.durationMs / unit.divisor }));
  return <section aria-label="Daily website usage chart">
    <div className="chart-summary"><span>{report.range.label}</span><strong>{formatDuration(report.totalMs)} total</strong></div>
    <p className="chart-unit">{unit.label.toLowerCase()} / day</p>
    <div className="chart-container">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={days} margin={{ top: 8, right: 5, bottom: 5, left: -23 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} strokeDasharray="3 4" />
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
            interval={days.length <= 7 ? 0 : 5}
            tickFormatter={date => parseLocalDate(String(date)).toLocaleDateString(undefined,
              days.length <= 7 ? { weekday: 'short' } : { day: 'numeric' })} />
          <YAxis axisLine={false} tickLine={false} tickCount={5} tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
            domain={[0, (maximum: number) => Math.max(1, maximum)]}
            tickFormatter={value => Number(Number(value).toFixed(2)).toString()} />
          <Tooltip cursor={{ fill: CHART_COLORS.grid, opacity: 0.4 }}
            contentStyle={{ background: CHART_COLORS.background, border: `1px solid ${CHART_COLORS.violet}`, borderRadius: 8, color: CHART_COLORS.text }}
            labelFormatter={date => parseLocalDate(String(date)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            formatter={value => [formatDuration(Number(value) * unit.divisor, true), 'Active time']} />
          <Bar dataKey="amount" fill={CHART_COLORS.bar} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
    <details className="chart-data"><summary>Daily values</summary><div className="data-table-scroll">
      <table><thead><tr><th>Date</th><th>Active time</th></tr></thead><tbody>
        {report.days.map(day => <tr key={day.date}><td>{day.date}</td><td>{formatDuration(day.durationMs, true)}</td></tr>)}
      </tbody></table></div>
    </details>
  </section>;
}
