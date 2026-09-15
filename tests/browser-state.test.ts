import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  contains: vi.fn(), window: vi.fn(), queryIdle: vi.fn(), queryTabs: vi.fn(), getTab: vi.fn(),
}));
vi.mock('wxt/browser', () => ({ browser: {
  permissions: { contains: mocks.contains },
  windows: { getLastFocused: mocks.window, WINDOW_ID_NONE: -1 },
  idle: { queryState: mocks.queryIdle },
  tabs: { query: mocks.queryTabs, get: mocks.getTab },
} }));
import { readBrowserState } from '../src/platform/browser-state';

const tab = { id: 1, windowId: 10, active: true, incognito: false, url: 'https://example.com/private?secret=true' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.contains.mockResolvedValue(true);
  mocks.window.mockResolvedValue({ id: 10, focused: true });
  mocks.queryIdle.mockResolvedValue('active');
  mocks.queryTabs.mockResolvedValue([tab]);
  mocks.getTab.mockResolvedValue(tab);
});

describe('browser eligibility and event sampling', () => {
  it('does not query sensitive browser APIs before permission is granted', async () => {
    mocks.contains.mockResolvedValue(false);
    expect(await readBrowserState()).toMatchObject({ site: null, status: 'permission', permissionGranted: false });
    expect(mocks.queryTabs).not.toHaveBeenCalled();
    expect(mocks.queryIdle).not.toHaveBeenCalled();
  });
  it('projects only the normalized hostname and minimal IDs', async () => {
    expect((await readBrowserState()).site).toEqual({ hostname: 'example.com', tabId: 1, windowId: 10 });
  });
  it.each(['idle', 'locked'])('does not track while %s', async idle => {
    mocks.queryIdle.mockResolvedValue(idle);
    expect(await readBrowserState()).toMatchObject({ site: null, status: 'idle' });
  });
  it('honors an idle event captured before a subsequent state query', async () => {
    expect((await readBrowserState({ idle: 'locked' })).site).toBeNull();
  });
  it('does not track an unfocused browser or a tab activated in a background window', async () => {
    mocks.window.mockResolvedValue({ id: 10, focused: false });
    expect((await readBrowserState()).site).toBeNull();
    expect((await readBrowserState({ tabId: 1, windowId: 10 })).site).toBeNull();
    mocks.window.mockResolvedValue({ id: 20, focused: true });
    expect((await readBrowserState({ tabId: 1, windowId: 10 })).site).toBeNull();
  });
  it('honors focus loss before an asynchronous window query completes', async () => {
    expect((await readBrowserState({ focusChanged: true, windowId: -1 })).site).toBeNull();
  });
  it.each([
    { ...tab, incognito: true }, { ...tab, discarded: true }, { ...tab, url: 'chrome://settings' },
  ])('excludes private, discarded and internal tabs', async value => {
    mocks.queryTabs.mockResolvedValue([value]);
    expect((await readBrowserState()).site).toBeNull();
  });
  it('retains a same-tab domain event snapshot instead of querying a later URL', async () => {
    const result = await readBrowserState({ tab: { ...tab, url: 'https://other.test/' } });
    expect(result.site?.hostname).toBe('other.test');
    expect(mocks.queryTabs).not.toHaveBeenCalled();
  });
  it('handles a tab closing between activation and sampling', async () => {
    mocks.getTab.mockRejectedValue(new Error('No tab with id: 1'));
    expect((await readBrowserState({ tabId: 1 })).site).toBeNull();
  });
  it('treats missing active tabs as unsupported', async () => {
    mocks.queryTabs.mockResolvedValue([]);
    expect((await readBrowserState()).status).toBe('unsupported');
  });
  it('stops tracking after the last browser window closes', async () => {
    mocks.window.mockRejectedValue(new Error('No current window'));
    expect(await readBrowserState()).toMatchObject({ site: null, status: 'unfocused' });
  });
  it('surfaces unexpected browser failures instead of silently corrupting accounting', async () => {
    mocks.window.mockRejectedValue(new Error('Unexpected API failure'));
    await expect(readBrowserState()).rejects.toThrow('Unexpected API failure');
  });
});
