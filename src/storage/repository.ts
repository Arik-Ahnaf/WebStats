import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import { reconcile } from '../tracking/accounting';
import { DEFAULT_PREFERENCES } from '../shared/types';
import type { Observation, Preferences, TrackerState, UsageRecord } from '../shared/types';

interface WebStatsDB extends DBSchema {
  usage: { key: [string, string]; value: UsageRecord; indexes: { date: string } };
  tracker: { key: string; value: TrackerState };
  preferences: { key: string; value: Preferences };
}

async function abortTransaction(tx: { abort(): void; done: Promise<unknown> }): Promise<void> {
  try { tx.abort(); }
  catch { /* An IndexedDB request error may already have aborted the transaction. */ }
  await tx.done.catch(() => undefined);
}

export class UsageRepository {
  private connection: Promise<IDBPDatabase<WebStatsDB>> | undefined;
  constructor(private readonly name = 'webstats') {}

  private db(): Promise<IDBPDatabase<WebStatsDB>> {
    if (!this.connection) {
      this.connection = openDB<WebStatsDB>(this.name, 1, {
        upgrade(db) {
          db.createObjectStore('usage', { keyPath: ['date', 'hostname'] }).createIndex('date', 'date');
          db.createObjectStore('tracker');
          db.createObjectStore('preferences');
        },
        blocking: () => { void this.close(); },
        terminated: () => { this.connection = undefined; },
      }).catch((error: unknown) => { this.connection = undefined; throw error; });
    }
    return this.connection;
  }

  async reconcile(observation: Observation): Promise<TrackerState> {
    const db = await this.db();
    // A single transaction makes a worker death either commit both the ledger
    // and its cursor, or neither. Replaying an event cannot credit time twice.
    const tx = db.transaction(['usage', 'tracker'], 'readwrite');
    void tx.done.catch(() => undefined); // surfaced by the awaited operation below
    try {
      const ledger = tx.objectStore('usage');
      const cursor = tx.objectStore('tracker');
      const transition = reconcile(await cursor.get('current'), observation);
      for (const increment of transition.increments) {
        const existing = await ledger.get([increment.date, increment.hostname]);
        await ledger.put({
          ...increment,
          durationMs: (existing?.durationMs ?? 0) + increment.durationMs,
          visits: (existing?.visits ?? 0) + increment.visits,
        });
      }
      await cursor.put(transition.state, 'current');
      await tx.done;
      return transition.state;
    } catch (error) {
      // Synchronous exceptions (including cloning/quota failures) must also
      // roll back earlier writes; an uncommitted cursor is never safe to replay.
      await abortTransaction(tx);
      throw error;
    }
  }

  async records(): Promise<UsageRecord[]> { return (await this.db()).getAll('usage'); }
  async state(): Promise<TrackerState | undefined> { return (await this.db()).get('tracker', 'current'); }
  async preferences(): Promise<Preferences> {
    return (await (await this.db()).get('preferences', 'current')) ?? { ...DEFAULT_PREFERENCES };
  }

  async updatePreferences(patch: Partial<Preferences>): Promise<Preferences> {
    const tx = (await this.db()).transaction('preferences', 'readwrite');
    void tx.done.catch(() => undefined);
    try {
      const current = (await tx.store.get('current')) ?? DEFAULT_PREFERENCES;
      const updated = { ...current, ...patch };
      await tx.store.put(updated, 'current');
      await tx.done;
      return updated;
    } catch (error) { await abortTransaction(tx); throw error; }
  }

  async deleteStatistics(observation: Observation): Promise<void> {
    const tx = (await this.db()).transaction(['usage', 'tracker'], 'readwrite');
    void tx.done.catch(() => undefined);
    try {
      await tx.objectStore('usage').clear();
      // Replace the old cursor in the deletion transaction. A queued checkpoint
      // can only account for new browsing after the reset, never restore history.
      await tx.objectStore('tracker').put({ ...observation, site: null }, 'current');
      await tx.done;
    } catch (error) { await abortTransaction(tx); throw error; }
  }

  async close(): Promise<void> {
    if (this.connection) (await this.connection).close();
    this.connection = undefined;
  }
}
