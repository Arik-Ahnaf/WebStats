import { browser } from 'wxt/browser';
import { normalizeHostname } from '../tracking/domain';
import { hasTrackingPermissions } from './permissions';
import type { Site, TrackingStatus } from '../shared/types';

export const IDLE_SECONDS = 60;

export interface Hint {
  tab?: { id?: number; windowId: number; incognito: boolean; url?: string; discarded?: boolean };
  tabId?: number;
  windowId?: number;
  focusChanged?: boolean;
  idle?: string;
  reset?: boolean;
}

export interface BrowserState {
  site: Site | null;
  currentSite: Site | null;
  status: TrackingStatus;
  permissionGranted: boolean;
}

let sessionPromise: Promise<string> | undefined;

export function browserSessionId(): Promise<string> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const stored = await browser.storage.session.get('browserSession');
      if (typeof stored.browserSession === 'string') return stored.browserSession;
      const id = crypto.randomUUID();
      await browser.storage.session.set({ browserSession: id });
      return id;
    })().catch((error: unknown) => { sessionPromise = undefined; throw error; });
  }
  return sessionPromise;
}

export async function readBrowserState(hint: Hint = {}): Promise<BrowserState> {
  const granted = await hasTrackingPermissions();
  if (!granted) return { site: null, currentSite: null, status: 'permission', permissionGranted: false };
  const [window, idle] = await Promise.all([
    browser.windows.getLastFocused().catch((error: unknown) => {
      if (error instanceof Error && /no (current |last focused )?window/i.test(error.message)) return undefined;
      throw error;
    }),
    hint.idle ? Promise.resolve(hint.idle) : browser.idle.queryState(IDLE_SECONDS),
  ]);
  if (!window) return { site: null, currentSite: null, status: 'unfocused', permissionGranted: true };
  const focused = hint.focusChanged ? hint.windowId !== browser.windows.WINDOW_ID_NONE : window.focused;
  const windowId = hint.windowId !== undefined && hint.windowId >= 0 ? hint.windowId : window.id;
  let tab = hint.tab;
  if (!tab && hint.tabId !== undefined) {
    try { tab = await browser.tabs.get(hint.tabId); }
    catch {
      // The tab may close between activation and sampling. Never attribute its
      // time to an unrelated tab; the removal event will sample the successor.
      return { site: null, currentSite: null, status: 'unsupported', permissionGranted: true };
    }
  }
  if (!tab && windowId !== undefined) [tab] = await browser.tabs.query({ active: true, windowId });
  const hostname = tab && !tab.incognito && !tab.discarded ? normalizeHostname(tab.url) : null;
  const currentSite = hostname && tab?.id !== undefined
    ? { hostname, tabId: tab.id, windowId: tab.windowId } : null;
  const status = !focused || (tab && tab.windowId !== (hint.focusChanged ? windowId : window.id)) ? 'unfocused'
    : idle !== 'active' ? 'idle' : currentSite ? 'active' : 'unsupported';
  return { site: status === 'active' ? currentSite : null, currentSite, status, permissionGranted: true };
}
