import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsageRepository } from '../src/storage/repository';
import type { Observation } from '../src/shared/types';

const repositories: UsageRepository[] = [];
const create = (name = crypto.randomUUID()) => { const repository = new UsageRepository(name); repositories.push(repository); return repository; };
afterEach(async () => { await Promise.all(repositories.splice(0).map(repository => repository.close())); });
const start = new Date(2026, 8, 15, 12).getTime();
const observation = (elapsed: number): Observation => ({
  site: { hostname: 'example.com', tabId: 1, windowId: 1 },
  at: start + elapsed, monotonic: elapsed, browserSession: 'browser', worker: 'worker', timeZone: 'America/New_York',
});

describe('durable, atomic analytics storage', () => {
  it('persists the cursor with time and survives a new repository/worker instance', async () => {
    const name = crypto.randomUUID();
    const first = create(name);
    await first.reconcile(observation(0));
    await first.reconcile(observation(30_000));
    await first.close();
    const second = create(name);
    await second.reconcile({ ...observation(50_000), worker: 'new-worker', monotonic: 0 });
    expect(await second.records()).toEqual([{ date: '2026-09-15', hostname: 'example.com', visits: 1, durationMs: 50_000 }]);
  });
  it('serializes competing transactions and never recredits a checkpoint', async () => {
    const repository = create();
    await repository.reconcile(observation(0));
    await Promise.all(Array.from({ length: 10 }, () => repository.reconcile(observation(30_000))));
    expect((await repository.records())[0]?.durationMs).toBe(30_000);
    expect((await repository.records())[0]?.visits).toBe(1);
  });
  it('resets all dates and the cursor together, preserving settings', async () => {
    const repository = create();
    await repository.updatePreferences({ onboarded: true, weekly: false });
    await repository.reconcile(observation(0));
    await repository.reconcile(observation(30_000));
    await repository.deleteStatistics(observation(35_000));
    expect(await repository.records()).toEqual([]);
    expect((await repository.state())?.site).toBeNull();
    // An event received before the reset cannot resurrect the deleted interval.
    await repository.reconcile(observation(32_000));
    expect(await repository.records()).toEqual([]);
    await repository.reconcile(observation(40_000));
    await repository.reconcile(observation(50_000));
    expect((await repository.records())[0]).toMatchObject({ visits: 1, durationMs: 10_000 });
    expect(await repository.preferences()).toMatchObject({ onboarded: true, weekly: false, monthly: true });
  });
  it('persists independent settings patches without overwriting one another', async () => {
    const repository = create();
    await Promise.all([repository.updatePreferences({ weekly: false }), repository.updatePreferences({ monthly: false })]);
    expect(await repository.preferences()).toMatchObject({ onboarded: false, generateCharts: true, weekly: false, monthly: false });
  });
  it('writes only the minimal analytics fields', async () => {
    const repository = create();
    await repository.reconcile(observation(0));
    expect(Object.keys((await repository.records())[0]!).sort()).toEqual(['date', 'durationMs', 'hostname', 'visits']);
  });
  it('rolls back ledger writes if saving the cursor throws, then retries exactly once', async () => {
    const repository = create();
    await repository.reconcile(observation(0));
    const original = IDBObjectStore.prototype.put;
    const fault = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === 'tracker') throw new DOMException('Simulated write failure', 'QuotaExceededError');
      return original.apply(this, args);
    });
    try { await expect(repository.reconcile(observation(30_000))).rejects.toThrow('Simulated write failure'); }
    finally { fault.mockRestore(); }
    expect((await repository.records())[0]?.durationMs).toBe(0);
    expect((await repository.state())?.at).toBe(start);
    await repository.reconcile(observation(30_000));
    expect((await repository.records())[0]?.durationMs).toBe(30_000);
  });
  it('rolls back deletion if the replacement cursor cannot be saved', async () => {
    const repository = create();
    await repository.reconcile(observation(0));
    await repository.reconcile(observation(10_000));
    const original = IDBObjectStore.prototype.put;
    const fault = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === 'tracker') throw new Error('Simulated cursor failure');
      return original.apply(this, args);
    });
    try { await expect(repository.deleteStatistics(observation(20_000))).rejects.toThrow('Simulated cursor failure'); }
    finally { fault.mockRestore(); }
    expect((await repository.records())[0]?.durationMs).toBe(10_000);
    expect((await repository.state())?.at).toBe(start + 10_000);
  });
});
