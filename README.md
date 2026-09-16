# WebStats

A private, local website-time tracker for Chrome/Chromium 120+ and desktop Firefox/Zen with Gecko 140+. Built with WXT, React, strict TypeScript, IndexedDB, Recharts, and CSS variables. No account, backend, telemetry, content scripts, or remote assets.

<img width="600" height="600" alt="WebStats Logo" src="https://github.com/user-attachments/assets/26a594f0-2c32-4c2a-b880-89b00dada77b" />

## Develop, build, and install

Use Node.js 22.12+, 24.x, or 26+ and npm. The original package name is retained; `package-lock.json` locks dependencies.

```sh
npm ci
npm run dev             # WXT development build with live reload
npm run typecheck
npm run lint
npm test
npm run build           # .output/chrome-mv3/
npm run zip             # Chromium ZIP in .output/
npm run dev:firefox      # Firefox MV3 development build
npm run build:firefox    # .output/firefox-mv3/
npm run zip:firefox      # Validated Firefox XPI and review sources in .output/
```

To load the production build:

1. Run `npm run build`.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select this repository’s `.output/chrome-mv3` directory.
4. Pin WebStats, open its popup, press **Start**, and accept the tracking permissions.
5. Browse an ordinary HTTP/HTTPS website. Reopen WebStats to see today’s usage.

After rebuilding, use **Reload** on the extension card. `npm run dev` creates a separate development build; its local development-server connection is absent from production. If WXT cannot locate Chrome, load `.output/chrome-mv3-dev` manually while the development server runs.

## Firefox and Zen installation

**Use the Firefox build, not `.output/chrome-mv3` or the Chromium ZIP.** Firefox MV3 uses a nonpersistent background page (`background.scripts`); Chromium uses a service worker. WXT generates the appropriate manifest, and Firefox gets a stable add-on ID and a declaration of no external data collection.

For local testing:

1. Run `npm run zip:firefox`.
2. Open `about:debugging#/runtime/this-firefox` in Firefox or Zen.
3. Click **Load Temporary Add-on** and select `.output/firefox-mv3/manifest.json` or `.output/webstats-firefox-unsigned.xpi`.
4. Open WebStats, press **Start**, and approve tab access. Idle access is also requested at that gesture; Firefox grants it silently.

Temporary add-ons are removed when the browser exits. For persistent installation via **Install Add-on From File**, you need a **Mozilla-signed XPI**. An unsigned XPI can be reported as corrupt or unverified; renaming a ZIP does not sign it. Do not install the GitHub repository/source ZIP as an add-on. See [Mozilla signing and distribution](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).

To obtain a signed package, upload `.output/webstats-firefox-unsigned.xpi` to [Mozilla Add-on Developer Hub](https://addons.mozilla.org/developers/) for **self-distribution**, provide `.output/webstats-sources.zip` when asked for source, and download the signed XPI after approval. Source includes the npm lockfile and build instructions above. Alternatively, set `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` in your terminal environment using your [AMO API credentials](https://addons.mozilla.org/developers/addon/api/key/) and run `npm run sign:firefox`. This submits an unlisted version plus its review sources and saves the signed artifact under `.output/firefox-signed/`. Keep credentials out of Git. Mozilla signing requires an account and approval; the local build is deliberately labeled **unsigned**.

`npm run lint:firefox` runs Mozilla's validator on the generated manifest and bundled code. The two remaining `innerHTML` warnings originate in React DOM's vendor implementation (including its unused `dangerouslySetInnerHTML` path), not WebStats's rendering code; site labels are ordinary escaped React text. The decimal chart dependency uses its ESM distribution to avoid the legacy UMD `Function` fallback.

## Screens and reports

- **Home:** current hostname, today’s elapsed time, visits, tracking status, and ranked top sites. Lists scroll without moving the bottom navigation.
- **Reports:** calendar Week/Month selection, previous periods, ranked usage, durations, shares of the selected period’s total, and progress bars. **View chart** opens a Recharts bar chart with tooltips and an accessible daily-value table.
- **Download chart:** exports a standalone 1000 × 620 SVG with dates, axes, seconds/minutes/hours as appropriate, total usage, and top site. Open the SVG in a browser or graphics editor; it scales without losing quality.
- **Delete Stats:** confirms deletion across **all dates**, clears usage and the tracking cursor atomically, and preserves preferences. Subsequent activity starts fresh.
- **Settings:** Generate charts controls subordinate Weekly and Monthly options, chart viewing, and exports. Turning charts off does not disable time tracking or ranked reports.
