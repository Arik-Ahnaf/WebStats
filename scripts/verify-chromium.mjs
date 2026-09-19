import { chromium, expect } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const extensionPath = path.resolve('.output/chrome-mv3');
const artifacts = path.resolve('test-results');
await mkdir(artifacts, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), 'webstats-chromium-'));
const results = [];
const errors = [];
const launch = () => chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, viewport: { width: 420, height: 500 },
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
let context = await launch();
let extensionId;
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  extensionId = id;
  const popup = await context.newPage();
  popup.on('pageerror', error => errors.push(error.message));
  popup.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await expect(popup.getByRole('heading', { name: 'Welcome to WebStats' })).toBeVisible();
  await expect(popup.getByRole('navigation')).toHaveCount(0);
  const initialPermissions = await popup.evaluate(() => chrome.permissions.getAll());
  if (initialPermissions.permissions?.length) throw new Error('Permissions were granted before Start');
  results.push('Unpacked MV3 extension loads with no permissions; first-run onboarding renders.');
  await popup.screenshot({ path: path.join(artifacts, 'lander.png') });
  // Native browser-chrome permission dialogs are outside Playwright's page DOM.
  // Simulate the denied API response only for this UI branch, in a disposable profile.
  await popup.evaluate(() => { chrome.permissions.request = async () => false; });
  await popup.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(popup.getByText('Access wasn’t granted. Tracking is off; you can try again.')).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await expect(popup.getByRole('navigation')).toHaveCount(0);
  await popup.screenshot({ path: path.join(artifacts, 'permission-denied.png') });
  results.push('Simulated permission denial leaves tracking off and exposes retry.');
} finally {
  await context.close();
}

// Supply real runtime grants in this script's fresh, closed test profile. No
// production manifest, user profile, or application code is modified. Start then
// calls the real permissions.request() API with previously granted permissions.
const preferencesPath = path.join(profile, 'Default', 'Preferences');
const preferences = JSON.parse(await readFile(preferencesPath, 'utf8'));
const extensionPreferences = preferences.extensions.settings[extensionId];
const grants = { api: ['tabs', 'idle', 'alarms', 'storage', 'favicon'], explicit_host: [], scriptable_host: [], manifest_permissions: [] };
extensionPreferences.active_permissions = grants;
extensionPreferences.granted_permissions = grants;
extensionPreferences.runtime_granted_permissions = grants;
await writeFile(preferencesPath, JSON.stringify(preferences));
context = await launch();
try {
  let popup = await context.newPage();
  popup.on('pageerror', error => errors.push(error.message));
  popup.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await popup.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(popup.getByRole('navigation')).toBeVisible();
  results.push('Real granted permission APIs complete onboarding and route to Home.');
  await popup.screenshot({ path: path.join(artifacts, 'home-empty.png') });
  const send = request => popup.evaluate(message => chrome.runtime.sendMessage(message), request);
  const snapshot = async () => {
    const response = await send({ type: 'snapshot' });
    if (!response.ok) throw new Error(response.error);
    return response.snapshot;
  };
  await context.route('https://*.webstats.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22><rect width=%22100%25%22 height=%22100%25%22 fill=%22%236650af%22/></svg>"><title>Test website</title><h1>Local browser fixture</h1>' }));
  const first = await context.newPage();
  await first.goto('https://alpha.webstats.test/private?do-not-store=this#secret');
  await first.bringToFront();
  await expect.poll(async () => (await snapshot()).currentSite?.hostname).toBe('alpha.webstats.test');
  await first.waitForTimeout(1200);
  const second = await context.newPage();
  await second.goto('https://beta.webstats.test/');
  await second.bringToFront();
  await expect.poll(async () => (await snapshot()).records.find(row => row.hostname === 'alpha.webstats.test')?.durationMs ?? 0).toBeGreaterThan(500);
  await second.waitForTimeout(700);
  await second.goto('https://gamma.webstats.test/');
  await expect.poll(async () => (await snapshot()).records.find(row => row.hostname === 'beta.webstats.test')?.durationMs ?? 0).toBeGreaterThan(300);
  const tracked = await snapshot();
  if (JSON.stringify(tracked.records).includes('do-not-store')) throw new Error('A URL leaked into analytics');
  results.push('Real tab switching and same-tab domain navigation attribute usage correctly; full URLs are not stored.');
  const readCursor = () => popup.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('webstats', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const request = db.transaction('tracker').objectStore('tracker').get('current');
      request.onsuccess = () => { resolve(request.result); db.close(); };
      request.onerror = () => { reject(request.error); db.close(); };
    };
  }));
  const beforeWorker = await readCursor();
  const cdp = await context.newCDPSession(popup);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  await snapshot();
  await expect.poll(async () => (await readCursor()).worker).not.toBe(beforeWorker.worker);
  const recovered = await snapshot();
  if (recovered.records.find(row => row.hostname === 'alpha.webstats.test')?.durationMs !== tracked.records.find(row => row.hostname === 'alpha.webstats.test')?.durationMs) throw new Error('Worker recovery recredited a closed visit');
  results.push('Forced service-worker termination recovers from IndexedDB without duplicating a completed visit.');
  await second.goto('about:blank');
  await expect.poll(async () => (await snapshot()).status).toBe('unsupported');
  const paused = (await snapshot()).records.reduce((sum, row) => sum + row.durationMs, 0);
  await second.waitForTimeout(600);
  if ((await snapshot()).records.reduce((sum, row) => sum + row.durationMs, 0) !== paused) throw new Error('Internal page time was counted');
  results.push('Navigating to an internal URL stops time accounting.');
  await popup.bringToFront();
  await popup.getByRole('button', { name: 'Reports', exact: true }).click();
  await expect(popup.getByRole('heading', { name: 'WebStats', exact: true })).toBeVisible();
  await popup.screenshot({ path: path.join(artifacts, 'reports.png') });
  await popup.getByRole('button', { name: 'View chart', exact: true }).click();
  await expect(popup.getByRole('dialog')).toBeVisible();
  await expect(popup.locator('.recharts-surface')).toBeVisible();
  await popup.screenshot({ path: path.join(artifacts, 'monthly-chart.png') });
  const downloaded = popup.waitForEvent('download');
  await popup.getByRole('dialog').getByRole('button', { name: 'Download chart', exact: true }).click();
  const download = await downloaded;
  const file = path.join(artifacts, download.suggestedFilename());
  await download.saveAs(file);
  const svg = await readFile(file, 'utf8');
  if (!svg.includes('<svg') || !svg.includes('alpha.webstats.test') || svg.includes('NaN')) throw new Error('Invalid chart artifact');
  results.push('Recharts renders monthly data and Download chart saves a valid standalone SVG.');
  await popup.getByRole('button', { name: 'Close dialog' }).click();
  await popup.getByRole('combobox', { name: 'Report period' }).selectOption('week');
  await popup.getByRole('button', { name: 'View chart', exact: true }).click();
  await expect(popup.locator('.recharts-surface')).toBeVisible();
  await expect(popup.locator('.recharts-xAxis .recharts-cartesian-axis-tick')).toHaveCount(7);
  await popup.screenshot({ path: path.join(artifacts, 'weekly-chart.png') });
  results.push('Weekly chart renders all seven calendar-day labels.');
  await popup.getByRole('button', { name: 'Close dialog' }).click();
  await popup.getByRole('button', { name: 'Settings', exact: true }).click();
  await popup.getByRole('checkbox', { name: 'Generate charts', exact: true }).uncheck();
  await expect(popup.getByRole('checkbox', { name: 'Weekly', exact: true })).toBeDisabled();
  await popup.reload();
  await popup.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(popup.getByRole('checkbox', { name: 'Generate charts', exact: true })).not.toBeChecked();
  await popup.getByRole('checkbox', { name: 'Generate charts', exact: true }).check();
  await expect(popup.getByRole('checkbox', { name: 'Weekly', exact: true })).toBeEnabled();
  await popup.screenshot({ path: path.join(artifacts, 'settings.png') });
  results.push('Chart settings persist across popup reload; subordinate controls follow Generate charts.');
  await popup.getByRole('checkbox', { name: 'Weekly', exact: true }).uncheck();
  await expect.poll(async () => (await snapshot()).preferences.weekly).toBe(false);
  const beforeRestart = await snapshot();
  const oldSession = (await readCursor()).browserSession;
  await context.close();
  await new Promise(resolve => setTimeout(resolve, 1200));
  context = await launch();
  popup = await context.newPage();
  popup.on('pageerror', error => errors.push(error.message));
  popup.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole('navigation')).toBeVisible();
  const afterRestart = await snapshot();
  if (JSON.stringify(afterRestart.records) !== JSON.stringify(beforeRestart.records)) throw new Error('Browser restart counted downtime');
  if (afterRestart.preferences.weekly !== false) throw new Error('Settings did not survive browser restart');
  if ((await readCursor()).browserSession === oldSession) throw new Error('Browser session identity survived a cold restart');
  results.push('A full Chromium restart preserves statistics, onboarding and settings; a fresh browser-session ID prevents counting downtime.');

  // Exercise variable-length names and scrolling with synthetic rows in this
  // disposable IndexedDB only. The extension itself never includes demo data.
  await popup.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('webstats', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('usage', 'readwrite');
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const fixture = [
        ['developer.mozilla.org', 7_860_000, 12], ['github.com', 5_880_000, 9], ['figma.com', 3_180_000, 6],
        ['a-very-long-hostname-that-needs-truncation.documentation.example.test', 1_600_000, 3],
        ...Array.from({ length: 80 }, (_, index) => [`site-${index}.example.test`, 600_000 - index * 1000, 1]),
      ];
      for (const [hostname, durationMs, visits] of fixture) tx.objectStore('usage').put({ date, hostname, durationMs, visits });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
  await popup.reload();
  await expect(popup.locator('.site-row')).toHaveCount(87);
  await expect(popup.locator('.site-favicon:not([hidden])').first()).toBeVisible();
  await popup.screenshot({ path: path.join(artifacts, 'home-many-sites.png') });
  await popup.getByRole('button', { name: 'Reports', exact: true }).click();
  await expect(popup.locator('.report-row')).toHaveCount(87);
  await expect(popup.locator('.report-row .domain').first()).toHaveText('mozilla');
  await expect(popup.locator('.report-row .site-icon').first().locator('.site-favicon:not([hidden])')).toBeVisible();
  const layout = await popup.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    navBottom: document.querySelector('.bottom-nav').getBoundingClientRect().bottom,
    canScroll: document.querySelector('.report-scroll').scrollHeight > document.querySelector('.report-scroll').clientHeight,
  }));
  if (layout.horizontalOverflow || layout.navBottom !== 500 || !layout.canScroll) throw new Error(`Invalid many-site layout: ${JSON.stringify(layout)}`);
  await popup.screenshot({ path: path.join(artifacts, 'reports-many-sites.png') });
  results.push('Many-site fixtures scroll internally, truncate long domains, and keep bottom navigation anchored.');
  await popup.getByRole('button', { name: 'View chart', exact: true }).click();
  await expect(popup.locator('.recharts-surface')).toBeVisible();
  await popup.screenshot({ path: path.join(artifacts, 'monthly-chart-hours.png') });
  await popup.getByRole('button', { name: 'Close dialog' }).click();
  await popup.getByRole('button', { name: 'Delete Stats', exact: true }).click();
  await expect(popup.getByRole('dialog')).toBeVisible();
  await popup.getByRole('button', { name: 'Keep Stats', exact: true }).click();
  if ((await snapshot()).records.length === 0) throw new Error('Cancel unexpectedly deleted statistics');
  await popup.getByRole('button', { name: 'Delete Stats', exact: true }).click();
  await popup.screenshot({ path: path.join(artifacts, 'delete-confirmation.png') });
  await popup.getByRole('button', { name: 'Delete everything', exact: true }).click();
  await expect(popup.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await snapshot()).records.length).toBe(0);
  results.push('Delete Stats requires confirmation; cancellation preserves data and confirmation clears it.');
  await popup.evaluate(() => chrome.permissions.remove({ permissions: ['tabs'] }));
  await expect(popup.getByRole('heading', { name: 'Welcome to WebStats' })).toBeVisible({ timeout: 6000 });
  results.push('Revoking a required optional permission immediately returns to the restricted onboarding state.');
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await context.close();
  await writeFile(path.join(artifacts, 'browser-validation.json'), JSON.stringify({ results, errors, profile }, null, 2));
  console.log(JSON.stringify({ results, errors }, null, 2));
}
