import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { UsageRepository } from '../src/storage/repository';
import { CHECKPOINT_SECONDS } from '../src/tracking/accounting';
import { SerialQueue } from '../src/tracking/serial-queue';
import { browserSessionId, IDLE_SECONDS, readBrowserState } from '../src/platform/browser-state';
import type { BrowserState, Hint } from '../src/platform/browser-state';
import { hasTrackingPermissions } from '../src/platform/permissions';
import { isRequest } from '../src/platform/messages';
import type { Observation, Request, Response, Snapshot } from '../src/shared/types';

const ALARM = 'webstats-checkpoint';

export default defineBackground(() => {
  const repository = new UsageRepository();
  const queue = new SerialQueue();
  const worker = crypto.randomUUID();
  let alarmListenerInstalled = false;
  let idleListenerInstalled = false;

  const stamp = () => ({
    at: Date.now(), monotonic: performance.now(), worker,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  function reportFailure(error: unknown): void {
    console.error('WebStats could not reconcile tracking:', error);
    void browser.action.setBadgeText({ text: '!' });
    void browser.action.setBadgeBackgroundColor({ color: '#FF383C' });
    void browser.action.setTitle({ title: 'WebStats — tracking needs attention. Open to retry.' });
  }

  async function reconcileState(sample: BrowserState, captured: ReturnType<typeof stamp>, reset = false): Promise<Observation> {
    const preferences = await repository.preferences();
    const observation: Observation = {
      ...captured,
      site: preferences.onboarded ? sample.site : null,
      browserSession: sample.permissionGranted ? await browserSessionId() : 'restricted',
      reset,
    };
    await repository.reconcile(observation);
    await browser.action.setBadgeText({ text: '' });
    await browser.action.setTitle({ title: 'WebStats' });
    return observation;
  }

  function schedule(hint: Hint = {}): void {
    const captured = stamp();
    // Begin the read at event receipt and retain event-specific tab/idle/focus
    // hints. Slow storage cannot collapse several rapid switches into one.
    const sample = readBrowserState(hint);
    void sample.catch(() => undefined); // the queued await below handles errors
    void queue.run(async () => { await reconcileState(await sample, captured, hint.reset); }).catch(reportFailure);
  }

  function installOptionalListeners(): void {
    if (!alarmListenerInstalled && browser.alarms?.onAlarm) {
      browser.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) schedule(); });
      alarmListenerInstalled = true;
    }
    if (!idleListenerInstalled && browser.idle?.onStateChanged) {
      browser.idle.onStateChanged.addListener(idle => schedule({ idle }));
      idleListenerInstalled = true;
    }
  }

  async function configureCapabilities(): Promise<void> {
    installOptionalListeners();
    if (!await hasTrackingPermissions()) return;
    browser.idle.setDetectionInterval(IDLE_SECONDS);
    const existing = await browser.alarms.get(ALARM);
    if (!existing || existing.periodInMinutes !== CHECKPOINT_SECONDS / 60) {
      await browser.alarms.create(ALARM, { periodInMinutes: CHECKPOINT_SECONDS / 60 });
    }
  }

  async function snapshot(sample: BrowserState): Promise<Snapshot> {
    const [preferences, records] = await Promise.all([repository.preferences(), repository.records()]);
    return {
      preferences, records, now: Date.now(), currentSite: sample.currentSite,
      permissionGranted: sample.permissionGranted,
      status: preferences.onboarded ? sample.status : 'setup',
    };
  }

  async function handleRequest(request: Request, captured: ReturnType<typeof stamp>, pendingSample: Promise<BrowserState>): Promise<Snapshot> {
    await configureCapabilities();
    const sample = await pendingSample;
    if (request.type === 'complete-onboarding') {
      if (!sample.permissionGranted) throw new Error('Tracking access was not granted. Press Start to try again.');
      await repository.updatePreferences({ onboarded: true });
    }
    if (request.type === 'settings') {
      // Copy only known fields, never accept onboarding state from this route.
      const { generateCharts, weekly, monthly } = request.settings;
      await repository.updatePreferences({ generateCharts, weekly, monthly });
    }
    if (request.type === 'delete-statistics') {
      await repository.deleteStatistics({
        ...captured, site: null,
        browserSession: sample.permissionGranted ? await browserSessionId() : 'restricted',
      });
    } else {
      await reconcileState(sample, captured);
    }
    return snapshot(sample);
  }

  // Register synchronously on every worker start, before opening IndexedDB or
  // awaiting permissions. Chrome can then wake this worker for these events.
  browser.tabs.onActivated.addListener(info => schedule({ tabId: info.tabId, windowId: info.windowId }));
  browser.tabs.onUpdated.addListener((_tabId, change, tab) => {
    if (tab.active && (change.url !== undefined || change.status !== undefined || change.discarded !== undefined)) {
      schedule({ tab: { id: tab.id, windowId: tab.windowId, incognito: tab.incognito, url: tab.url, discarded: tab.discarded } });
    }
  });
  browser.tabs.onRemoved.addListener(() => schedule());
  // Some Firefox versions omit Chromium's prerender replacement event.
  browser.tabs.onReplaced?.addListener(() => schedule());
  browser.tabs.onDetached.addListener(() => schedule());
  browser.tabs.onAttached.addListener(() => schedule());
  browser.windows.onFocusChanged.addListener(windowId => schedule({ windowId, focusChanged: true }));
  browser.windows.onRemoved.addListener(() => schedule());
  browser.runtime.onStartup.addListener(() => {
    // storage.session supplies a fresh browser ID on a cold start. A separate
    // reset here would count another visit after the initial recovery sample.
    schedule();
    void configureCapabilities().catch(reportFailure);
  });
  browser.runtime.onInstalled.addListener(() => {
    schedule();
    void configureCapabilities().catch(reportFailure);
  });
  browser.permissions.onAdded.addListener(() => {
    void configureCapabilities().then(() => schedule()).catch(reportFailure);
  });
  browser.permissions.onRemoved.addListener(() => {
    schedule({ reset: true });
  });
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL('/')) || !isRequest(message)) return;
    const captured = stamp();
    const pendingSample = readBrowserState();
    void pendingSample.catch(() => undefined);
    void queue.run(() => handleRequest(message, captured, pendingSample)).then(
      value => sendResponse({ ok: true, snapshot: value } satisfies Response),
      (error: unknown) => {
        reportFailure(error);
        sendResponse({ ok: false, error: 'WebStats could not read or save your data. Reopen the extension to retry. Existing statistics have been kept.' } satisfies Response);
      },
    );
    return true;
  });
  installOptionalListeners();
  void configureCapabilities().catch(reportFailure);
  schedule();
});
