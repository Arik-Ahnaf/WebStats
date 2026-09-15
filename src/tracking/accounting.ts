import { localDate, splitAtMidnight } from '../analytics/dates';
import type { Observation, TrackerState, UsageRecord } from '../shared/types';

export const CHECKPOINT_SECONDS = 30;
export const MAX_GAP_MS = 90_000;
export const CLOCK_TOLERANCE_MS = 2_000;

export interface Transition {
  state: TrackerState;
  increments: UsageRecord[];
}

/** Pure, replay-safe accounting. The caller commits state and increments together. */
export function reconcile(previous: TrackerState | undefined, next: Observation): Transition {
  if (!Number.isFinite(next.at) || !Number.isFinite(next.monotonic)) {
    throw new Error('Invalid tracking clock');
  }
  const state: TrackerState = {
    site: next.site, at: next.at, browserSession: next.browserSession,
    worker: next.worker, monotonic: next.monotonic, timeZone: next.timeZone,
  };
  // Freeze accounting until a rolled-back wall clock catches up. This also
  // rejects stale queued observations without overlapping already credited time.
  if (previous && next.at < previous.at && previous.browserSession === next.browserSession) {
    return { state: { ...previous, site: null }, increments: [] };
  }
  const elapsed = previous ? next.at - previous.at : 0;
  const clockStable = !previous || previous.worker !== next.worker ||
    Math.abs(elapsed - (next.monotonic - previous.monotonic)) <= CLOCK_TOLERANCE_MS;
  const continuous = !!previous && !next.reset && clockStable &&
    previous.browserSession === next.browserSession && previous.timeZone === next.timeZone &&
    elapsed >= 0 && elapsed <= MAX_GAP_MS;
  const increments: UsageRecord[] = continuous && previous.site
    ? splitAtMidnight(previous.at, next.at).map(piece => ({
      ...piece, hostname: previous.site!.hostname, visits: 0,
    })) : [];
  const sameSite = continuous && previous.site && next.site &&
    previous.site.hostname === next.site.hostname && previous.site.tabId === next.site.tabId &&
    previous.site.windowId === next.site.windowId;
  if (next.site && !sameSite) {
    increments.push({ hostname: next.site.hostname, date: localDate(next.at), durationMs: 0, visits: 1 });
  }
  return { state, increments };
}
