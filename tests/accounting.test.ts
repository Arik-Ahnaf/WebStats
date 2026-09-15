import { describe, expect, it } from 'vitest';
import { reconcile, MAX_GAP_MS } from '../src/tracking/accounting';
import type { Observation, Site, TrackerState } from '../src/shared/types';
import { SerialQueue } from '../src/tracking/serial-queue';

const site: Site = { hostname: 'example.com', tabId: 1, windowId: 10 };
const start = new Date(2026, 8, 15, 12).getTime();
const observation = (elapsed = 0, next: Site | null = site, extra: Partial<Observation> = {}): Observation => ({
  site: next, at: start + elapsed, monotonic: elapsed, browserSession: 'browser-1', worker: 'worker-1', timeZone: 'America/New_York', ...extra,
});
const initial = (): TrackerState => reconcile(undefined, observation()).state;
const duration = (previous: TrackerState, next: Observation) => reconcile(previous, next).increments.reduce((sum, row) => sum + row.durationMs, 0);

describe('event-driven accounting', () => {
  it('starts a single visit without inventing duration', () => {
    expect(reconcile(undefined, observation()).increments).toEqual([{ date: '2026-09-15', hostname: 'example.com', durationMs: 0, visits: 1 }]);
  });
  it('duplicate activation, update and checkpoint events do not add visits or time twice', () => {
    const checkpoint = reconcile(initial(), observation(30_000));
    expect(checkpoint.increments[0]?.durationMs).toBe(30_000);
    expect(checkpoint.increments[0]?.visits).toBe(0);
    expect(reconcile(checkpoint.state, observation(30_000)).increments).toEqual([]);
    expect(duration(checkpoint.state, observation(60_000))).toBe(30_000);
  });
  it('attributes a tab switch to the previous site and starts the new visit', () => {
    const switched = reconcile(initial(), observation(12_000, { ...site, hostname: 'second.test', tabId: 2 }));
    expect(switched.increments).toEqual([
      { hostname: 'example.com', date: '2026-09-15', durationMs: 12_000, visits: 0 },
      { hostname: 'second.test', date: '2026-09-15', durationMs: 0, visits: 1 },
    ]);
  });
  it('counts a same-tab domain navigation as a new visit but not a path change', () => {
    expect(reconcile(initial(), observation(1000, { ...site, hostname: 'other.test' })).increments.at(-1)?.visits).toBe(1);
    expect(reconcile(initial(), observation(1000)).increments.reduce((sum, row) => sum + row.visits, 0)).toBe(0);
  });
  it.each(['focus loss', 'idle', 'locked', 'internal page', 'incognito'])('stops on %s and does not credit the paused gap', () => {
    const paused = reconcile(initial(), observation(20_000, null));
    expect(paused.increments[0]?.durationMs).toBe(20_000);
    expect(duration(paused.state, observation(60_000, null))).toBe(0);
    const resumed = reconcile(paused.state, observation(70_000));
    expect(resumed.increments).toEqual([{ hostname: 'example.com', date: '2026-09-15', durationMs: 0, visits: 1 }]);
  });
  it('recovers a suspended worker from its persisted checkpoint once', () => {
    const checkpoint = reconcile(initial(), observation(30_000));
    const recovered = reconcile(structuredClone(checkpoint.state), observation(50_000, site, { worker: 'worker-2', monotonic: 0 }));
    expect(recovered.increments[0]?.durationMs).toBe(20_000);
    expect(reconcile(recovered.state, observation(50_000, site, { worker: 'worker-2', monotonic: 0 })).increments).toEqual([]);
  });
  it('never counts browser downtime, even if restarted within the gap limit', () => {
    expect(duration(initial(), observation(15_000, site, { browserSession: 'browser-2' }))).toBe(0);
    expect(duration(initial(), observation(15_000, site, { reset: true }))).toBe(0);
  });
  it('drops long suspension/sleep instead of fabricating hours of usage', () => {
    expect(duration(initial(), observation(MAX_GAP_MS + 1))).toBe(0);
    expect(duration(initial(), observation(3_600_000))).toBe(0);
  });
  it('detects shorter sleep and forward wall-clock changes against the worker clock', () => {
    expect(duration(initial(), observation(40_000, site, { monotonic: 1000 }))).toBe(0);
  });
  it('freezes after a backwards clock jump without recrediting already recorded time', () => {
    const checkpoint = reconcile(initial(), observation(30_000));
    const rollback = reconcile(checkpoint.state, observation(10_000));
    expect(rollback.increments).toEqual([]);
    expect(rollback.state.site).toBeNull();
    expect(rollback.state.at).toBe(start + 30_000);
    expect(duration(rollback.state, observation(40_000))).toBe(0);
  });
  it('discards the ambiguous interval when the local time zone changes', () => {
    expect(duration(initial(), observation(20_000, site, { timeZone: 'Asia/Dhaka' }))).toBe(0);
  });
  it('splits a current interval exactly at local midnight without an extra visit', () => {
    const at = new Date(2026, 8, 15, 23, 59, 50).getTime();
    const previous = { ...initial(), at };
    const result = reconcile(previous, observation(20_000, site, { at: at + 20_000 }));
    expect(result.increments).toEqual([
      { hostname: 'example.com', date: '2026-09-15', durationMs: 10_000, visits: 0 },
      { hostname: 'example.com', date: '2026-09-16', durationMs: 10_000, visits: 0 },
    ]);
  });
  it('rejects invalid clocks', () => {
    expect(() => reconcile(initial(), observation(0, site, { at: NaN }))).toThrow('Invalid tracking clock');
  });
});

describe('arrival ordering', () => {
  it('preserves rapid switches despite asynchronous storage, and recovers after failure', async () => {
    const queue = new SerialQueue();
    const calls: number[] = [];
    let release: () => void = () => undefined;
    const delayed = new Promise<void>(resolve => { release = resolve; });
    const first = queue.run(async () => { await delayed; calls.push(1); });
    const second = queue.run(async () => { calls.push(2); throw new Error('disk unavailable'); });
    const failed = expect(second).rejects.toThrow('disk unavailable');
    const third = queue.run(async () => { calls.push(3); });
    release();
    await Promise.all([first, failed, third]);
    expect(calls).toEqual([1, 2, 3]);
  });
});
