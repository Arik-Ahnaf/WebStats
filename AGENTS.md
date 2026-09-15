# AGENTS.md

## Mission

Build WebStats: a polished, privacy-first browser extension that tracks active website usage time and presents the data through the UI defined in the WebStats Figma design.

Before implementation:
1. Read this file completely.
2. Inspect the existing repository.
3. Inspect all relevant files in `codex_references/`.
4. If Figma access is available, inspect `https://www.figma.com/design/PkzLUXsP7qn7ANnRlL75C8/WebStats`.
5. Preserve useful existing project configuration instead of replacing it blindly.

## Design Authority

The Figma file is the primary UI authority.

### Area/layout outlines — STRICT

Treat these Figma outline frames as structural requirements:
- `Main Page Outline`
- `Dashboard Page Outline`
- `Settings Page Outline`
- `Lander Page Outline`

The major areas, their order, purpose, and relative placement must be preserved. Do not reorganize the information architecture, move major sections to different screens, replace the bottom navigation pattern, or invent a generic dashboard layout.

### Final page mockups — CLOSE REFERENCE

Treat these final Figma frames as the visual reference:
- `Main Page`
- `Reports Page`
- `Settings Page`
- `Lander Page`

The implementation should look recognizably close to them, but does not need pixel-perfect dimensions.

You have freedom to adjust exact width/height values, font sizes, minor spacing, responsive details, control dimensions, and text wrapping when necessary for usability, dynamic data, browser constraints, or accessibility.

Do not substantially change the color language, section placement, navigation model, visual hierarchy, overall proportions, or branding character.

`codex_references/` is supplementary reference material. If it conflicts with the Figma area's structure, the Figma area structure wins.

## Figma-Derived Visual Language

Primary design tokens:
- Background: `#141023`
- Foreground/text: `#E0DCEF`
- Dark violet/navigation/header: `#3D3069`
- Primary violet: `#6650AF`
- Destructive red: `#FF383C`

Typography:
- Use IBM Plex Sans or the closest project-supported equivalent if there is a technical reason not to bundle it.
- Preserve the reference hierarchy and font weights.
- Exact font sizes are flexible.

The reference popup canvas is approximately `420 × 500` with rounded outer corners. Treat this as the intended compact scale and proportion, not an immutable pixel specification.

Use the supplied WebStats spider-web/clock logo faithfully. Do not redraw or approximate it if an exact asset is available in Figma or `codex_references/`.

## Required Screens and Areas

### Lander / onboarding

Purpose: first-run entry and permission onboarding.

Structure:
- prominent branded/top area,
- WebStats logo,
- welcome title,
- concise product description,
- primary Start action in the lower area.

If the extension needs any user-grantable browser/site permissions, request them here when the user presses `Start`.

Rules:
- Do not request optional permissions before a user gesture.
- Explain concisely why access is needed.
- Prefer runtime/optional permissions or optional host access when technically possible.
- If permission is denied, stay in onboarding/restricted state and provide a retry path.
- Never pretend tracking is active when required permission was not granted.
- Permissions that cannot technically be deferred under the browser platform must be kept minimal and documented in the README.
- After required permission/onboarding succeeds, persist onboarding state and route to Main.

### Main page

Strict areas:
1. Current site stats area at the top.
2. Top Sites area in the middle.
3. Persistent bottom navigation.

Current-site content should support real dynamic data such as current hostname/site, current active-session or today's usage, visit count, and site icon/favicon when safely available.

Top Sites must show ranked real usage data rather than hard-coded sample sites.

### Reports / dashboard page

Strict areas:
1. Branding/title area.
2. Report controls and usage/report content area.
3. Actions near the lower content area.
4. Persistent bottom navigation.

The Figma final frame shows a `WebStats` heading, separator, period selector such as Month, ranked site usage entries, durations, percentages/progress bars, `Download chart`, and destructive `Delete Stats`. Preserve that model.

This screen is the primary analytics/dashboard surface. It may scroll internally when real data exceeds the mockup.

Weekly/monthly graph functionality should belong naturally to this reporting workflow without destroying the defined area layout. Charts can be shown in a dedicated report/chart view, modal, internal extension page, or another compact presentation that remains visually consistent with the Figma design.

### Settings page

Strict areas:
1. Branding/header area.
2. Settings controls area.
3. Persistent bottom navigation.

The current design includes WebStats branding/logo, tagline, version, `Generate charts`, and nested `Weekly` / `Monthly` options. Preserve this hierarchy. Weekly and Monthly options should only be meaningful when chart generation is enabled.

### Bottom navigation

Use the Figma navigation concept consistently across Main, Reports, and Settings:
- Home
- Reports
- Settings

Keep it visually anchored to the bottom and close to the reference design. Active/inactive states should be clear. The Lander does not need the normal bottom navigation until onboarding is complete.

## Product Requirements

- Track time spent on the currently active website.
- Count time only while the browser window is focused, the user is active rather than idle/locked, and the active tab is an `http://` or `https://` page.
- Stop/reconcile tracking when the active tab changes, URL/domain changes, browser window loses focus, the user becomes idle or locked, or browser/service-worker lifecycle transitions occur.
- Aggregate usage by normalized hostname/domain and local calendar date.
- Support daily data plus weekly/monthly reporting.
- Support graph/chart generation for weekly/monthly usage.
- Support downloading/exporting the generated chart from the report workflow.
- Support deleting/resetting stored statistics behind a confirmation step.
- All core functionality must work locally without an account or backend.

## Preferred Technical Direction

Use the existing Node project and configure it as needed.

Preferred stack:
- WXT
- React
- strict TypeScript
- Manifest V3
- Recharts for interactive/report charts
- IndexedDB for durable analytics data
- CSS variables/design tokens
- Vitest for unit tests

Do not install Tailwind merely because Figma-generated reference code uses Tailwind. Use the project's chosen styling approach and translate the design appropriately.

Use WXT's cross-browser `browser` API where practical instead of scattering direct `chrome.*` calls.

No backend, authentication system, telemetry, analytics SDK, or remote tracking.

## Tracking Architecture

Manifest V3 service workers are not permanent processes. Never implement tracking as a background `setInterval` that assumes the worker stays alive.

Use browser lifecycle events as the source of truth, including relevant equivalents of:
- `tabs.onActivated`
- `tabs.onUpdated`
- `windows.onFocusChanged`
- `idle.onStateChanged`
- `runtime.onStartup`
- `runtime.onInstalled`
- `alarms.onAlarm`

Maintain a small persisted current-tracking state sufficient to recover after service-worker restarts.

Whenever a meaningful transition occurs:
1. Reconcile elapsed time for the previous tracked site.
2. Determine whether tracking should currently be active.
3. Start/update the current state.
4. Persist safely.

Use periodic alarms/checkpoints only as a recovery/checkpoint mechanism, not as the primary timer.

Defend against double-counting, rapid tab changes, duplicate browser events, sleep/wake, long service-worker suspension, browser restart, local-midnight crossing, and system clock anomalies. Split tracked intervals correctly at local midnight.

## Storage and Privacy

Default to storing only what analytics requires:
- normalized hostname/domain,
- local date,
- accumulated duration,
- visit count if needed,
- minimal display metadata when justified.

Do not persist full URLs, query strings, fragments, page titles, page content, or form data.

Exclude browser/internal pages and unsupported schemes such as `chrome://`, `edge://`, `about:`, extension pages, and devtools pages.

Do not track private/incognito windows unless support is intentionally added and explicitly permitted by the browser/user.

Keep permissions minimal and document why each one exists. All usage data remains on-device.

## Chart Requirements

Charts should visually match the WebStats brand while retaining the clarity of good data-analysis/matplotlib-style plots:
- readable axes/labels,
- restrained gridlines,
- sensible tick density,
- consistent time units,
- useful tooltips where interactive,
- no 3D effects,
- no excessive decoration.

Support weekly and monthly aggregation from the same underlying stored data. The `Download chart` action must export a useful chart artifact rather than being a placeholder.

## UI Quality

- Reuse centralized design tokens.
- Build reusable components for navigation, buttons, ranked-site rows, progress bars, controls, and report widgets.
- Support real variable-length domains/site names gracefully.
- Preserve the dark WebStats visual identity.
- Provide empty, loading, permission-denied, and error states.
- Keep destructive actions visually distinct and confirm data deletion.
- Add visible keyboard focus states.
- Respect `prefers-reduced-motion`.
- Maintain reasonable contrast.
- Do not replace the design with a generic shadcn/admin/SaaS interface.

## Code Quality

- Strict TypeScript.
- Avoid `any` unless unavoidable.
- Keep tracking/domain logic independent of React.
- Separate extension entrypoints, tracking engine, permission/onboarding logic, storage/repository layer, aggregation/query logic, chart/export logic, shared types, UI components, design tokens/styles, and tests.
- Put time/date accounting into pure functions where possible.
- Avoid unnecessary dependencies.
- Do not leave placeholder TODOs for core behavior.
- Do not silently swallow errors that could corrupt usage data.
- Follow the existing package manager and lockfile if present.

## Validation

Before considering the work complete:
- run type checking,
- run linting if configured,
- run tests,
- run the production extension build,
- fix material errors/warnings,
- verify the unpacked Chromium build loads.

Test or explicitly reason through first-run onboarding, permission grant, permission denial/retry, active tab switching, same-tab domain navigation, browser focus loss, idle/locked state, service-worker restart, browser restart, midnight rollover, unsupported/internal URLs, empty usage data, reports with many sites, weekly aggregation, monthly aggregation, chart export, deleting statistics, and persistence of user settings.

Add unit tests for accounting and date aggregation cases most likely to lose or double-count time.

## Working Style

Read this file before starting and re-check it when making architecture or UI decisions.

Do not pause for minor aesthetic or implementation decisions that can be inferred from the Figma design, `codex_references/`, and these requirements.

When a requirement conflicts with browser/platform security constraints, choose the safest technically correct implementation and document the tradeoff.

When finished, report what was built, major architecture decisions, how permission onboarding works, permissions used and why, commands for development/build/test, unpacked-extension loading instructions, validation performed, and genuine remaining browser limitations.
