import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import webExt from 'web-ext';

const firefoxApp = await import(new URL('lib/firefox/index.js', import.meta.resolve('web-ext')));
const { getPrefs } = await import(new URL('lib/firefox/preferences.js', import.meta.resolve('web-ext')));

// Mozilla RDP + web-ext test the unchanged production package in a fresh profile.
// No signature checks are disabled. Native permission UI is not automated.
const artifacts = path.resolve('test-results');
await mkdir(artifacts, { recursive: true });
const results = [];
const server = createServer((_request, response) => { response.end('<!doctype html><title>WebStats local test</title>Local browser test'); });
await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
const port = server.address().port;
const runner = await webExt.cmd.run({
  sourceDir: path.resolve('.output/firefox-mv3'), artifactsDir: artifacts,
  firefox: process.env.FIREFOX_BINARY || 'firefox', target: ['firefox-desktop'],
  args: ['-headless'], noReload: true, noInput: true,
}, { firefoxApp: {
  ...firefoxApp,
  // web-ext normally disables signature checks in development profiles. Keep
  // enforcement enabled here: temporary installation needs no signing bypass.
  createProfile: options => firefoxApp.createProfile({
    ...options,
    configureThisProfile: (profile, config) => firefoxApp.configureProfile(profile, {
      ...config, getPrefs: app => ({ ...getPrefs(app), 'xpinstall.signatures.required': true }),
    }),
  }),
} });
const remote = runner.extensionRunners[0].remoteFirefox;
const client = remote.client;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function timeout(promise, label) {
  let timer;
  return Promise.race([promise, new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 10000);
  })]).finally(() => clearTimeout(timer));
}

// web-ext's minimal RDP client handles request/response packets. Forward modern
// debugger events separately so they cannot consume a pending response.
const originalHandler = client._handleMessage.bind(client);
client._handleMessage = packet => {
  if (['evaluationResult', 'target-available-form', 'target-destroyed-form'].includes(packet.type)) {
    client.emit('webstats-test-packet', packet);
  } else originalHandler(packet);
};

async function evaluate(actor, text) {
  let handler;
  const result = new Promise((resolve, reject) => {
    handler = packet => {
      if (packet.from !== actor || packet.type !== 'evaluationResult') return;
      if (packet.hasException) reject(new Error(packet.exceptionMessage));
      else resolve(packet.result);
    };
    client.on('webstats-test-packet', handler);
  });
  try {
    await timeout(client.request({ to: actor, type: 'evaluateJSAsync', text }), 'evaluate acknowledgement');
    return await timeout(result, 'evaluate result');
  } finally { client.off('webstats-test-packet', handler); }
}

async function evaluateAsync(actor, expression) {
  await evaluate(actor, `globalThis.__webstatsTest = null; Promise.resolve(${expression}).then(
    value => globalThis.__webstatsTest = JSON.stringify({ok: true, value}),
    error => globalThis.__webstatsTest = JSON.stringify({ok: false, error: String(error)})); "pending"`);
  for (let i = 0; i < 60; i++) {
    const result = await evaluate(actor, 'globalThis.__webstatsTest');
    if (typeof result === 'string') {
      const parsed = JSON.parse(result);
      if (!parsed.ok) throw new Error(parsed.error);
      return parsed.value;
    }
    await pause(100);
  }
  throw new Error('Asynchronous browser evaluation did not finish');
}

async function eventually(actor, expression) {
  for (let i = 0; i < 60; i++) {
    if (await evaluate(actor, expression) === true) return;
    await pause(100);
  }
  throw new Error(`Browser condition failed: ${expression}`);
}

try {
  // Exercise the actual archive too, catching a nested/missing root manifest.
  await remote.installTemporaryAddon(path.resolve('.output/webstats-firefox-unsigned.xpi'), false);
  const addon = await remote.getInstalledAddon('webstats@webstats.local');
  assert.deepEqual(addon.warnings, []);
  assert.equal(addon.persistentBackgroundScript, false);
  results.push('Firefox XPI installs in a temporary profile with no manifest warnings and a nonpersistent background.');

  const { processDescriptor } = await client.request({ to: 'root', type: 'getProcess', id: 0 });
  const { process: parent } = await client.request({ to: processDescriptor.actor, type: 'getTarget' });
  assert.equal(await evaluate(parent.consoleActor, 'Services.prefs.getBoolPref("xpinstall.signatures.required")'), true);
  const popupUrl = addon.manifestURL.replace('manifest.json', 'popup.html');
  await evaluate(parent.consoleActor, `{
    const win = Services.wm.getMostRecentWindow("navigator:browser");
    win.gBrowser.selectedTab = win.gBrowser.addTab(${JSON.stringify(popupUrl)},
      {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()});
  } "opened"`);
  await pause(500);
  const watcher = await client.request({ to: addon.actor, type: 'getWatcher' });
  let targetHandler;
  const popupTarget = new Promise(resolve => {
    targetHandler = packet => {
      if (packet.from === watcher.actor && packet.type === 'target-available-form' && packet.target.url === popupUrl) resolve(packet.target);
    };
    client.on('webstats-test-packet', targetHandler);
  });
  await timeout(client.request({ to: watcher.actor, type: 'watchTargets', targetType: 'frame' }), 'watch extension documents');
  const popup = await timeout(popupTarget, 'popup debugger target');
  client.off('webstats-test-packet', targetHandler);
  const actor = popup.consoleActor;
  const message = request => evaluateAsync(actor, `browser.runtime.sendMessage(${JSON.stringify(request)}).then(response => {
    if (!response.ok) throw new Error(response.error); return response.snapshot;
  })`);
  await eventually(actor, 'document.body.innerText.includes("Welcome to WebStats")');
  let snapshot = await message({ type: 'snapshot' });
  assert.equal(snapshot.permissionGranted, false);
  assert.equal(snapshot.preferences.onboarded, false);
  const permissions = await evaluateAsync(actor, 'browser.permissions.getAll()');
  assert.deepEqual(permissions.permissions.sort(), ['alarms', 'storage']);
  results.push('First-run onboarding renders; only local alarms/storage are granted at installation.');

  await evaluate(actor, 'globalThis.__originalPermissionRequest = browser.permissions.request; browser.permissions.request = () => Promise.resolve(false); document.querySelector(".start-button").click(); true');
  await eventually(actor, 'document.body.innerText.includes("Access wasn’t granted")');
  assert.equal((await message({ type: 'snapshot' })).permissionGranted, false);
  assert.equal(await evaluate(actor, 'document.querySelector(".start-button").textContent.trim()'), 'Try again');
  await evaluate(actor, 'browser.permissions.request = globalThis.__originalPermissionRequest; true');
  results.push('Simulated permission denial leaves tracking off and exposes retry.');

  // Test grants in this fresh profile, with the extension notified like the real
  // native approval path. No changes are made to the production manifest/code.
  await evaluateAsync(parent.consoleActor, 'ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs").ExtensionPermissions.add("webstats@webstats.local", {permissions:["tabs","idle"], origins:[]}, WebExtensionPolicy.getByID("webstats@webstats.local").extension)');
  const point = JSON.parse(await evaluate(actor, 'JSON.stringify((() => {const r = document.querySelector(".start-button").getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2};})())'));
  // Send trusted browser input rather than DOM click(), which Firefox correctly
  // rejects as a gesture for permissions.request().
  await evaluate(parent.consoleActor, `{
    const win = Services.wm.getMostRecentWindow("navigator:browser");
    const rect = win.gBrowser.selectedBrowser.getBoundingClientRect();
    for (const type of ["mousedown", "mouseup"]) {
      if (typeof win.synthesizeMouseEvent === "function") {
        win.synthesizeMouseEvent(type, rect.x + ${point.x}, rect.y + ${point.y},
          {button:0, clickCount:1, modifiers:0, inputSource:win.MouseEvent.MOZ_SOURCE_MOUSE},
          {isDOMEventSynthesized:true, isWidgetEventSynthesized:false, isAsyncEnabled:false});
      } else win.windowUtils.sendMouseEvent(type, rect.x + ${point.x}, rect.y + ${point.y}, 0, 1, 0);
    }
  } true`);
  await eventually(actor, 'document.querySelector(".bottom-nav") !== null');
  assert.equal((await message({ type: 'snapshot' })).preferences.onboarded, true);
  results.push('Start uses real Firefox permission APIs with test-profile grants and persists onboarding.');

  const tab = await evaluateAsync(actor, `browser.tabs.create({url:"http://127.0.0.1:${port}/private?query=secret", active:true}).then(tab => ({id:tab.id}))`);
  await pause(800);
  snapshot = await message({ type: 'snapshot' });
  assert.equal(snapshot.status, 'active');
  assert.equal(snapshot.currentSite.hostname, '127.0.0.1');
  assert.ok(snapshot.records.some(row => row.hostname === '127.0.0.1' && row.durationMs > 0));
  await evaluateAsync(actor, `browser.tabs.update(${tab.id}, {url:"http://localhost:${port}/different#secret"}).then(() => true)`);
  await pause(800);
  snapshot = await message({ type: 'snapshot' });
  assert.equal(snapshot.currentSite.hostname, 'localhost');
  assert.ok(snapshot.records.some(row => row.hostname === 'localhost' && row.durationMs > 0));
  assert.ok(snapshot.records.every(row => Object.keys(row).sort().join(',') === 'date,durationMs,hostname,visits'));
  await evaluateAsync(actor, `browser.tabs.update(${tab.id}, {url:"about:blank"}).then(() => true)`);
  await pause(300);
  assert.equal((await message({ type: 'snapshot' })).status, 'unsupported');
  results.push('Real tab activation and same-tab domain navigation accumulate hostname-only data; internal pages stop tracking.');

  await message({ type: 'settings', settings: { generateCharts: true, weekly: false, monthly: true } });
  assert.equal((await message({ type: 'snapshot' })).preferences.weekly, false);
  await evaluate(actor, 'document.querySelector("[aria-label=Reports]").click(); true');
  await eventually(actor, 'document.body.innerText.includes("View chart")');
  await evaluate(actor, '[...document.querySelectorAll("button")].find(button => button.textContent === "View chart").click(); true');
  await eventually(actor, 'document.querySelector("dialog .recharts-surface") !== null');
  await evaluate(actor, 'document.querySelector(`[aria-label="Close dialog"]`).click(); true');
  results.push('Chart settings persist and the monthly Recharts report renders under Firefox’s production CSP.');

  await evaluateAsync(actor, 'browser.permissions.remove({permissions:["tabs"]})');
  assert.equal((await message({ type: 'snapshot' })).permissionGranted, false);
  // React intentionally suspends refreshes while its tab is hidden.
  await evaluateAsync(actor, 'browser.tabs.getCurrent().then(tab => browser.tabs.update(tab.id, {active:true})).then(() => true)');
  await eventually(actor, 'document.body.innerText.includes("Welcome to WebStats")');
  results.push('Revoking tab access returns the popup to restricted onboarding.');
  const validation = { browser: process.env.FIREFOX_BINARY || 'firefox', results };
  await writeFile(path.join(artifacts, 'firefox-validation.json'), JSON.stringify(validation, null, 2));
  console.log(JSON.stringify(validation, null, 2));
} finally {
  client.disconnect();
  await runner.exit();
  await new Promise(resolve => server.close(resolve));
}
