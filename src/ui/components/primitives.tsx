import { useEffect, useId, useRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { RankedSite } from '../../analytics/reports';
import { formatDuration } from '../../analytics/reports';
import { faviconUrl } from '../favicon';
import { siteNameFromHostname } from '../site-name';
import type { SiteFavicons } from '../useSiteFavicons';

export type Page = 'home' | 'reports' | 'settings';

export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`button ${className}`} />;
}

export function Navigation({ page, onChange }: { page: Page; onChange: (page: Page) => void }) {
  return <nav className="bottom-nav" aria-label="Main navigation">
    {(['home', 'reports', 'settings'] as const).map(item => <button
      key={item} aria-label={item === 'home' ? 'Home' : item === 'reports' ? 'Reports' : 'Settings'}
      aria-current={page === item ? 'page' : undefined} onClick={() => onChange(item)}
    ><img src={`/assets/${item}.svg`} alt="" width="40" height="36" />
      <span>{item === 'home' ? 'Home' : item === 'reports' ? 'Reports' : 'Settings'}</span>
    </button>)}
  </nav>;
}

export function SiteIcon({ hostname, large = false, favicon }: {
  hostname: string | null; large?: boolean; favicon?: string;
}) {
  const initial = hostname ? siteNameFromHostname(hostname).slice(0, 1).toUpperCase() : 'W';
  const size = large ? 64 : 32;
  const source = hostname ? faviconUrl(hostname, size, favicon) : null;
  return <span className={`site-icon ${large ? 'site-icon-large' : ''}`} aria-hidden="true">
    <span className="site-icon-fallback">{initial}</span>
    {source && <img key={source} className="site-favicon" src={source} alt=""
      width={size} height={size} onError={event => { event.currentTarget.hidden = true; }} />}
  </span>;
}

export function SiteRow({ site, rank, report = false, favicons = {} }: {
  site: RankedSite; rank: number; report?: boolean; favicons?: SiteFavicons;
}) {
  return <li className={`site-row ${report ? 'report-row' : ''}`}>
    <span className="rank" aria-hidden="true">{rank}.</span>
    <SiteIcon hostname={site.hostname} favicon={favicons[site.hostname]} />
    <div className="site-details">
      <span className="domain" title={site.hostname}>{siteNameFromHostname(site.hostname)}</span>
      <div className="site-numbers"><span className="duration">{formatDuration(site.durationMs)}</span>
        {report && <span className="percentage">{site.percentage.toFixed(1)}%</span>}
      </div>
      {report && <div className="progress" role="progressbar" aria-label={`${site.hostname} share of usage`}
        aria-valuenow={Math.round(site.percentage)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${site.percentage}%` }} />
      </div>}
    </div>
  </li>;
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-state"><p className="empty-title">{title}</p><p>{children}</p></div>;
}

export function Checkbox({ checked, onChange, children, disabled = false }: {
  checked: boolean; onChange: (checked: boolean) => void; children: ReactNode; disabled?: boolean;
}) {
  return <label className={`checkbox-label ${disabled ? 'is-disabled' : ''}`}>
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} disabled={disabled} />
    <span>{children}</span>
  </label>;
}

export function Modal({ title, children, onClose, className = '' }: {
  title: string; children: ReactNode; onClose: () => void; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => { dialog?.close(); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  return <dialog ref={ref} className={`modal ${className}`} aria-labelledby={id}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="modal-header"><h2 id={id}>{title}</h2>
      <button className="icon-button" aria-label="Close dialog" onClick={onClose}>×</button>
    </header>{children}
  </dialog>;
}
