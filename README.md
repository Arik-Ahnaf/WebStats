# WebStats

A private, local website-time tracker for Chrome/Chromium 120+ and desktop Firefox/Zen with Gecko 140+. Built with WXT, React, strict TypeScript, IndexedDB, Recharts, and CSS variables. No account, backend, telemetry, content scripts, or remote assets.

The 420 × 500 popup follows all four structural outlines and finished screens in the [WebStats Figma design](https://www.figma.com/design/PkzLUXsP7qn7ANnRlL75C8/WebStats). The supplied logo and navigation SVGs are copied unchanged; IBM Plex Sans is bundled locally. Site initials avoid contacting favicon services.

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

## Permissions and onboarding

**Tracking access is requested only on Start.** Chromium defers all four permissions. Firefox does not support `alarms` or `storage` as optional permissions, so its manifest declares those two at installation; neither grants website access. Firefox defers `tabs` and `idle`. Start directly calls `permissions.request()` from the click gesture with the appropriate optional permissions:

| Permission | Purpose |
| --- | --- |
| `tabs` | Read the active tab’s URL in memory and immediately reduce it to a hostname. No browsing-history API is used. |
| `idle` | Pause when the OS reports idle or locked; inactivity threshold is 60 seconds. |
| `alarms` | Checkpoint every 30 seconds and recover the tracking cursor after worker suspension. |
| `storage` | Keep a random browser-session ID in `storage.session`, so browser shutdown time is never joined onto an earlier session. Analytics and preferences use IndexedDB. |

There are no host permissions, scripting permissions, or download permissions. A denied request leaves onboarding visible with **Try again**; success persists onboarding and opens Home. Revocation immediately prevents new tracking and returns the UI to onboarding. Existing data is retained for reconnection. Declaring local storage/alarms on Firefox does not enable tracking before setup succeeds. The [Firefox optional-permissions documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/optional_permissions) lists the supported runtime permissions.

Chrome’s `tabs` warning may mention browsing history because of the API’s capabilities; WebStats only reads the current tab’s hostname. The [Chrome permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions) documents runtime requests and user gestures.

## Screens and reports

- **Home:** current hostname, today’s elapsed time, visits, tracking status, and ranked top sites. Lists scroll without moving the bottom navigation.
- **Reports:** calendar Week/Month selection, previous periods, ranked usage, durations, shares of the selected period’s total, and progress bars. **View chart** opens a Recharts bar chart with tooltips and an accessible daily-value table.
- **Download chart:** exports a standalone 1000 × 620 SVG with dates, axes, seconds/minutes/hours as appropriate, total usage, and top site. Open the SVG in a browser or graphics editor; it scales without losing quality.
- **Delete Stats:** confirms deletion across **all dates**, clears usage and the tracking cursor atomically, and preserves preferences. Subsequent activity starts fresh.
- **Settings:** Generate charts controls subordinate Weekly and Monthly options, chart viewing, and exports. Turning charts off does not disable time tracking or ranked reports.

Weeks start Monday; months use real calendar boundaries. Missing days are zero-filled. A visit means the start of an active browsing session (including returning from idle/focus loss or switching tabs). Same-host navigation and duplicate events do not add visits. A visit spanning midnight continues its duration on the next date without inventing a second visit.

## Architecture and data

| Location | Responsibility |
| --- | --- |
| `entrypoints/background.ts` | Synchronous browser event registration, serialized event/command handling, alarms, and error badge. |
| `src/platform/` | Browser eligibility, optional permissions, browser-session identity, and validated internal messages. |
| `src/tracking/` | Pure accounting reducer and an arrival-ordered async queue, independent of React. |
| `src/storage/` | IndexedDB repository; usage and cursor commit in one transaction. |
| `src/analytics/` | Host rankings, local-date splitting, calendar reports, and duration formatting. |
| `src/charts/` | Consistent units and standalone SVG export. |
| `src/ui/` | Four pages, shared controls/navigation, chart modal, errors, and centralized design tokens. |
| `tests/`, `scripts/verify-chromium.mjs` | Accounting/storage/browser-adapter tests and unpacked Chromium integration checks. |

Events handle tab activation, navigation, closing/replacement/movement, window focus/closure, idle/lock, browser startup, extension installation, permissions, and checkpoint alarms. Each transition reconciles the previous interval, chooses the next eligible site, and persists the result. There is **no background interval timer**. Only the visible popup refreshes every two seconds.

Each usage row contains only `{ hostname, date, durationMs, visits }`. Hostnames are lowercased, internationalized names use ASCII/punycode, ports and trailing dots are removed, and subdomains remain distinct. Full URLs, queries, fragments, titles, page content, form data, and favicons are never persisted. A separate small cursor stores site/tab/window IDs, timestamp, time zone, and random worker/browser IDs. Preferences are local, never synced.

The ledger and cursor share one atomic transaction, including rollback on synchronous write failures. Concurrent or replayed checkpoints therefore cannot credit an interval twice. Deletion updates both in one transaction. Database failures surface in the popup and an `!` badge rather than silently resetting data. All runtime code, fonts, and icons are packaged; the production content security policy prohibits network connections.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run zip:firefox
npm run lint:firefox
npx playwright install chromium
npm run test:browser
npm run test:firefox      # Requires a Firefox executable
```

The browser script uses its own temporary profile and the **unchanged production build**. It checks onboarding, a simulated denied permission response, real previously granted permissions, live tab/domain transitions, internal-page exclusion, forced worker termination, a full browser restart, settings, chart export, long names/many sites, navigation placement, and deletion. It writes screenshots, an SVG, and `browser-validation.json` to ignored `test-results/`. Synthetic report rows exist only in the disposable test profile.

The Firefox script installs the **actual unsigned XPI temporarily** using Mozilla `web-ext`, verifies first-run local-only permissions, simulated denial/retry, real Start requests after disposable-profile grants, HTTP hostname changes, internal-page exclusion, settings, chart rendering, and revocation. It saves `test-results/firefox-validation.json`. It never disables signature checks or changes your browser profile. Set `FIREFOX_BINARY` to test a Firefox derivative, for example `FIREFOX_BINARY=/opt/zen-browser-bin/zen npm run test:firefox`. This workspace was tested in Zen 1.21.15b / Gecko 154. Native prompt approval/denial still needs a manual smoke check; grants and denial are supplied only inside the test profile.

To use a custom browser download directory, set `PLAYWRIGHT_BROWSERS_PATH` for **both** install and test commands. This workspace was verified with `/tmp/webstats-browsers`. Native Chromium permission dialogs are outside Playwright’s page DOM: the denial response is simulated, and the script seeds grants in its closed temporary profile before exercising the real permission API. It never changes the user’s profile or production permissions.

Unit tests cover double counting, rapid event ordering, paused states, worker/browser restart, midnight/year rollover, 23/25-hour DST days, backwards/forwards clocks, long sleep gaps, time-zone changes, excluded schemes/private tabs, weekly/monthly/leap-year aggregation, export, and transactional failure/retry.

For a final desktop smoke check, accept/deny the native permission prompt, switch focus to another application, leave the computer idle for 60 seconds, lock/unlock it, and sleep/wake it. These OS signals are covered by mocked eligibility/accounting tests; headless automation does not physically lock or suspend the machine.

## Browser limits

- Chrome controls event delivery and [alarm timing during sleep](https://developer.chrome.com/docs/extensions/reference/api/alarms). Gaps over 90 seconds are discarded, as are time-zone changes and clock jumps inconsistent with the worker’s monotonic clock. This intentionally favors undercounting over fabricated sleep time. Very short sleeps across a worker restart may be indistinguishable from active time within the recovery window.
- Browser shutdown, crashes, extension updates, or permission revocation may lose the tail since the last checkpoint (normally up to 30 seconds, longer if Chrome delays alarms). A fresh [`storage.session`](https://developer.chrome.com/docs/extensions/reference/api/storage#property-session) ID prevents counting time while the browser was closed. Moving the system clock backwards pauses accounting until it catches up.
- “Idle” means the browser/OS idle detector, not proof of attention. The 60-second grace period counts as active. Passive reading/video can stop counting after this threshold; OS/Wayland idle reporting may vary.
- Dates reflect the local time zone when recorded. Historical rows are not reinterpreted after travel. `www.example.com` and `example.com` remain separate hosts.
- Internal pages, extension pages, discarded tabs, and incognito/private browsing are excluded. No private-mode support is implemented.
- Data stays in this browser profile until deletion or uninstall. It is not encrypted separately from the browser profile and has no cloud backup. SVG exports are explicit user downloads and are not removed by Delete Stats.
