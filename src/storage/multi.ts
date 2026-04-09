import { StorageAdapter } from './base.js';
import { TrackedRequest, QueryOptions } from '../types.js';

/**
 * MultiStorage — fans out every write to all configured adapters simultaneously.
 * Reads (query / getAll / get / count / export) fall through to the first
 * adapter that returns a non-empty result, skipping adapters that don't persist
 * data (e.g. logging-only).
 */
export class MultiStorage extends StorageAdapter {
  constructor(private readonly adapters: StorageAdapter[]) {
    super();
  }

  /** Write to every adapter; one failure never blocks the others. */
  async save(request: TrackedRequest): Promise<void> {
    await Promise.allSettled(this.adapters.map(a => a.save(request)));
  }

  async get(id: string): Promise<TrackedRequest | null> {
    for (const adapter of this.adapters) {
      const result = await adapter.get(id).catch(() => null);
      if (result) return result;
    }
    return null;
  }

  async query(options: QueryOptions): Promise<TrackedRequest[]> {
    for (const adapter of this.adapters) {
      const results = await adapter.query(options).catch(() => [] as TrackedRequest[]);
      if (results.length > 0) return results;
    }
    return [];
  }

  async getAll(): Promise<TrackedRequest[]> {
    for (const adapter of this.adapters) {
      const results = await adapter.getAll().catch(() => [] as TrackedRequest[]);
      if (results.length > 0) return results;
    }
    return [];
  }

  async delete(id: string): Promise<void> {
    await Promise.allSettled(this.adapters.map(a => a.delete(id)));
  }

  async clear(): Promise<void> {
    await Promise.allSettled(this.adapters.map(a => a.clear()));
  }

  async count(): Promise<number> {
    for (const adapter of this.adapters) {
      const n = await adapter.count().catch(() => 0);
      if (n > 0) return n;
    }
    return 0;
  }

  async export(format: 'json' | 'csv'): Promise<string> {
    for (const adapter of this.adapters) {
      const data = await adapter.export(format).catch(() => '');
      if (data) return data;
    }
    return '';
  }
}
