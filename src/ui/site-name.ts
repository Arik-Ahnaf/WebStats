const COMMON_COUNTRY_SUFFIXES = new Set(['ac', 'co', 'com', 'edu', 'gov', 'net', 'org']);

/**
 * Turn a stored hostname into a compact display label without changing the
 * hostname used for tracking, reports, or accessible hover text.
 */
export function siteNameFromHostname(hostname: string): string {
  const host = hostname.replace(/^www\./, '');
  if (host === 'localhost' || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) return host;

  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) return host;
  const countrySuffix = labels.at(-1)?.length === 2 && COMMON_COUNTRY_SUFFIXES.has(labels.at(-2) ?? '');
  return labels.at(countrySuffix && labels.length > 2 ? -3 : -2) ?? host;
}
