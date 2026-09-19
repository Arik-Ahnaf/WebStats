import { browser } from 'wxt/browser';

function sitePageUrl(hostname: string): string {
  const host = hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
  return `https://${host}/`;
}

/** Resolve favicons from browser-local data without contacting a favicon service. */
export function faviconUrl(hostname: string, size: number, firefoxFavicon?: string): string | null {
  const pageUrl = sitePageUrl(hostname);
  if (import.meta.env.BROWSER === 'firefox') return firefoxFavicon ?? null;
  const endpoint = new URL('/_favicon/', browser.runtime.getURL('/popup.html')).href;
  return `${endpoint}?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`;
}
