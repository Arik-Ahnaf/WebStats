import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { normalizeHostname } from '../tracking/domain';

export type SiteFavicons = Readonly<Record<string, string>>;

/** Firefox exposes locally cached tab icons as data URLs under the existing tabs permission. */
export function useSiteFavicons(enabled: boolean): SiteFavicons {
  const [favicons, setFavicons] = useState<SiteFavicons>({});

  useEffect(() => {
    if (import.meta.env.BROWSER !== 'firefox' || !enabled) return;
    let active = true;
    const remember = (url: string | undefined, icon: string | undefined) => {
      const hostname = normalizeHostname(url);
      if (!active || !hostname || !icon?.startsWith('data:image/')) return;
      setFavicons(current => current[hostname] === icon ? current : { ...current, [hostname]: icon });
    };
    const refresh = () => {
      void browser.tabs.query({}).then(tabs => {
        if (!active) return;
        for (const tab of tabs) remember(tab.url, tab.favIconUrl);
      }).catch(() => undefined);
    };
    const onUpdated: Parameters<typeof browser.tabs.onUpdated.addListener>[0] = (_tabId, change, tab) => {
      remember(tab.url, change.favIconUrl ?? tab.favIconUrl);
    };
    const onActivated = () => { refresh(); };
    refresh();
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onActivated.addListener(onActivated);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onActivated.removeListener(onActivated);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [enabled]);

  return favicons;
}
