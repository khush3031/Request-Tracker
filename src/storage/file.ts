import * as fs from 'fs';
import * as path from 'path';
import { StorageAdapter, applyQueryFilters } from './base';
import { TrackedRequest, QueryOptions } from '../types';

/**
 * File-based persistent storage adapter.
 * Requests survive server restarts by writing to a JSON file.
 */
export class FileStorage extends StorageAdapter {
  private filePath: string;
  private requests: Map<string, TrackedRequest> = new Map();
  private maxSize: number;
  private dirty = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: { filePath?: string; maxSize?: number; flushIntervalMs?: number } = {}) {
    super();
    this.filePath = options.filePath ?? path.join(process.cwd(), '.request-tracker-data.json');
    this.maxSize = options.maxSize ?? 50000;
    this.load();

    // Flush to disk every 5 seconds if dirty
    const interval = options.flushIntervalMs ?? 5000;
    this.flushTimer = setInterval(() => { if (this.dirty) this.flush(); }, interval);

    // Flush on process exit
    process.on('exit', () => this.flush());
    process.on('SIGINT', () => { this.flush(); process.exit(); });
    process.on('SIGTERM', () => { this.flush(); process.exit(); });
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const arr: TrackedRequest[] = JSON.parse(raw);
        for (const r of arr) this.requests.set(r.id, r);
      }
    } catch {
      // Corrupted file — start fresh
      this.requests.clear();
    }
  }

  private flush(): void {
    try {
      const arr = Array.from(this.requests.values());
      fs.writeFileSync(this.filePath, JSON.stringify(arr), 'utf8');
      this.dirty = false;
    } catch {
      // Ignore write errors
    }
  }

  async save(request: TrackedRequest): Promise<void> {
    if (this.requests.size >= this.maxSize) {
      // Remove oldest 10%
      const sorted = Array.from(this.requests.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
      sorted.slice(0, Math.ceil(this.maxSize * 0.1)).forEach(([id]) => this.requests.delete(id));
    }
    this.requests.set(request.id, request);
    this.dirty = true;
  }

  async get(id: string): Promise<TrackedRequest | null> {
    return this.requests.get(id) ?? null;
  }

  async query(options: QueryOptions): Promise<TrackedRequest[]> {
    return applyQueryFilters(Array.from(this.requests.values()), options);
  }

  async getAll(): Promise<TrackedRequest[]> {
    return Array.from(this.requests.values());
  }

  async delete(id: string): Promise<void> {
    this.requests.delete(id);
    this.dirty = true;
  }

  async clear(): Promise<void> {
    this.requests.clear();
    this.dirty = true;
    this.flush();
  }

  async count(): Promise<number> {
    return this.requests.size;
  }

  async export(format: 'json' | 'csv'): Promise<string> {
    const requests = Array.from(this.requests.values());
    if (format === 'json') return JSON.stringify(requests, null, 2);
    const { RequestFormatter } = await import('../utils/formatter');
    return [RequestFormatter.getCSVHeader(), ...requests.map(r => RequestFormatter.toCSV(r))].join('\n');
  }

  destroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flush();
  }
}
