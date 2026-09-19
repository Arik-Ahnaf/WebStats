import { localDate } from '../../analytics/dates';
import { formatDuration, rankSites } from '../../analytics/reports';
import type { Snapshot } from '../../shared/types';
import { EmptyState, SiteIcon, SiteRow } from '../components/primitives';
import { siteNameFromHostname } from '../site-name';
import type { SiteFavicons } from '../useSiteFavicons';

export function Home({ snapshot, stale, favicons }: { snapshot: Snapshot; stale: boolean; favicons: SiteFavicons }) {
  const today = localDate(snapshot.now);
  const sites = rankSites(snapshot.records.filter(record => record.date === today));
  const hostname = snapshot.currentSite?.hostname ?? null;
  const current = sites.find(site => site.hostname === hostname);
  const status = stale ? 'Status unavailable' : snapshot.status === 'active' ? 'Tracking now'
    : snapshot.status === 'idle' ? 'Paused · you’re away' : snapshot.status === 'unfocused' ? 'Paused · browser unfocused'
      : 'Open a website to begin';
  return <main className="home-page">
    <section className="current-site" aria-label="Current site statistics">
      <SiteIcon hostname={hostname} favicon={hostname ? favicons[hostname] : undefined} large />
      <div className="current-details">
        <h1 title={hostname ?? undefined}>{hostname ? siteNameFromHostname(hostname) : 'Your time, here'}</h1>
        <div className="current-numbers"><span>{formatDuration(current?.durationMs ?? 0, true)}</span>
          <span>{current?.visits ?? 0} {(current?.visits ?? 0) === 1 ? 'visit' : 'visits'}</span></div>
        <p className="tracking-status"><span className={`status-dot ${snapshot.status === 'active' && !stale ? 'is-active' : ''}`} />{status}</p>
      </div>
    </section>
    <section className="top-sites" aria-labelledby="top-sites-title">
      <header className="section-heading"><h2 id="top-sites-title">Top Sites</h2><span>Today</span></header>
      <div className="site-scroll" tabIndex={0} aria-label="Today's ranked sites">
        {sites.length ? <ol className="site-list">{sites.map((site, index) => <SiteRow key={site.hostname} site={site} rank={index + 1} favicons={favicons} />)}</ol>
          : <EmptyState title="A little browsing goes a long way">Visit a website to see your time here.<br />Only active, focused browsing counts.</EmptyState>}
      </div>
    </section>
  </main>;
}
