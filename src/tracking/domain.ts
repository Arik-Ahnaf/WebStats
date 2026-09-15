/** Deliberately group by hostname, never guess registrable domains or keep URLs. */
export function normalizeHostname(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.hostname.toLowerCase().replace(/\.+$/, '') || null;
  } catch {
    return null;
  }
}
