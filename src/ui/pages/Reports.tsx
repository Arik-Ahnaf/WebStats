import { lazy, Suspense, useMemo, useState } from 'react';
import { buildReport, formatDuration } from '../../analytics/reports';
import { downloadChart } from '../../charts/export';
import type { Period, Snapshot } from '../../shared/types';
import { Button, EmptyState, Modal, SiteRow } from '../components/primitives';

const UsageChart = lazy(() => import('../components/UsageChart').then(module => ({ default: module.UsageChart })));

export function Reports({ snapshot, onDelete, onSettings, busy }: {
  snapshot: Snapshot; onDelete: () => Promise<boolean>; onSettings: () => void; busy: boolean;
}) {
  const [period, setPeriod] = useState<Period>('month');
  const [offset, setOffset] = useState(0);
  const [dialog, setDialog] = useState<'delete' | 'chart' | null>(null);
  const [notice, setNotice] = useState('');
  const report = useMemo(() => buildReport(snapshot.records, period, snapshot.now, offset), [snapshot.records, period, snapshot.now, offset]);
  const canChart = snapshot.preferences.generateCharts && snapshot.preferences[period === 'week' ? 'weekly' : 'monthly'];

  function download() {
    try { downloadChart(report); setNotice('Chart exported as SVG.'); }
    catch { setNotice('The chart could not be downloaded. Please try again.'); }
  }

  async function remove() {
    if (await onDelete()) { setDialog(null); setNotice('All saved statistics deleted. New browsing starts fresh.'); }
  }

  return <main className="reports-page">
    <header className="reports-brand"><h1>WebStats</h1></header>
    <section className="report-controls" aria-label="Report period">
      <div className="report-toolbar">
        {canChart ? <button className="text-button" onClick={() => setDialog('chart')}>View chart</button>
          : <button className="text-button" onClick={onSettings}>Enable charts</button>}
        <label className="period-picker">Period <select aria-label="Report period" value={period} onChange={event => { setPeriod(event.target.value as Period); setOffset(0); setNotice(''); }}>
          <option value="week">Week</option><option value="month">Month</option>
        </select></label>
      </div>
      <div className="period-range"><button className="icon-button" aria-label="Previous period" onClick={() => { setOffset(value => value - 1); setNotice(''); }}>‹</button>
        <span>{report.range.label}</span>
        <button className="icon-button" aria-label="Next period" disabled={offset === 0} onClick={() => { setOffset(value => value + 1); setNotice(''); }}>›</button>
        <span className="report-total">{formatDuration(report.totalMs)} total</span>
      </div>
    </section>
    <section className="report-scroll" tabIndex={0} aria-label="Ranked website usage">
      {report.sites.length ? <ol className="site-list">{report.sites.map((site, index) => <SiteRow key={site.hostname} site={site} rank={index + 1} report />)}</ol>
        : <EmptyState title="Your report starts with a visit">No website activity for this {period}.<br />Browse a little, then check back.</EmptyState>}
    </section>
    <div className="report-notice" role="status">{notice || (!canChart ? 'Chart downloads are turned off in Settings.' : '')}</div>
    <section className="report-actions" aria-label="Report actions">
      <Button onClick={download} disabled={!canChart || busy}>Download chart</Button>
      <Button className="button-danger" onClick={() => setDialog('delete')} disabled={busy || snapshot.records.length === 0}>Delete Stats</Button>
    </section>
    {dialog === 'delete' && <Modal title="Delete all statistics?" onClose={() => { if (!busy) setDialog(null); }}>
      <p>This removes website times and visit counts from <strong>every date</strong> on this device. It can’t be undone.</p>
      <p className="muted">Your chart settings stay saved. Tracking starts fresh with your next activity.</p>
      <div className="modal-actions"><Button className="button-secondary" disabled={busy} onClick={() => setDialog(null)} autoFocus>Keep Stats</Button>
        <Button className="button-danger" disabled={busy} onClick={() => { void remove(); }}>{busy ? 'Deleting…' : 'Delete everything'}</Button></div>
    </Modal>}
    {dialog === 'chart' && canChart && <Modal title={`${period === 'week' ? 'Weekly' : 'Monthly'} report`} onClose={() => setDialog(null)} className="chart-modal">
      <Suspense fallback={<p role="status">Drawing your chart…</p>}><UsageChart report={report} /></Suspense>
      <Button className="chart-download" onClick={download}>Download chart</Button>
      <p className="chart-footnote">Scalable SVG · generated entirely on this device</p>
    </Modal>}
  </main>;
}
