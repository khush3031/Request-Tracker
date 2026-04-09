import { StorageAdapter, applyQueryFilters } from './base.js';
import { TrackedRequest, MemoryStorageConfig, QueryOptions } from '../types.js';

/**
 * In-memory storage adapter
 * Stores requests in RAM, useful for real-time analytics
 */
export class MemoryStorage extends StorageAdapter {
  private requests: Map<string, TrackedRequest> = new Map();
  private config: MemoryStorageConfig;

  constructor(config: MemoryStorageConfig) {
    super();
    this.config = config;

    // Auto cleanup based on TTL
    if (config.ttl > 0) {
      setInterval(() => {
        this.cleanupExpired();
      }, Math.min(config.ttl, 60000)); // Check every minute
    }
  }

  async save(request: TrackedRequest): Promise<void> {
    // Check if we need to handle max size
    if (this.requests.size >= this.config.maxSize) {
      await this.handleMaxSize();
    }

    this.requests.set(request.id, request);
  }

  async get(id: string): Promise<TrackedRequest | null> {
    return this.requests.get(id) || null;
  }

  async query(options: QueryOptions): Promise<TrackedRequest[]> {
    const requests = Array.from(this.requests.values());
    return applyQueryFilters(requests, options);
  }

  async getAll(): Promise<TrackedRequest[]> {
    return Array.from(this.requests.values());
  }

  async delete(id: string): Promise<void> {
    this.requests.delete(id);
  }

  async clear(): Promise<void> {
    this.requests.clear();
  }

  async count(): Promise<number> {
    return this.requests.size;
  }

  async export(format: 'json' | 'csv'): Promise<string> {
    const requests = Array.from(this.requests.values());

    if (format === 'json') {
      return JSON.stringify(requests, null, 2);
    }

    // CSV format
    const { RequestFormatter } = await import('../utils/formatter');
    const lines = [RequestFormatter.getCSVHeader()];
    lines.push(...requests.map(r => RequestFormatter.toCSV(r)));
    return lines.join('\n');
  }

  /**
   * Get memory usage info
   */
  getMemoryUsage(): {
    memoryUsed: number;
    itemsStored: number;
    averageItemSize: number;
  } {
    let totalSize = 0;
    let itemCount = 0;

    for (const request of this.requests.values()) {
      totalSize += JSON.stringify(request).length;
      itemCount++;
    }

    return {
      memoryUsed: totalSize,
      itemsStored: itemCount,
      averageItemSize: itemCount > 0 ? totalSize / itemCount : 0
    };
  }

  /**
   * Handle max size reached
   */
  private async handleMaxSize(): Promise<void> {
    const action = this.config.onMaxReached || 'discard';

    if (action === 'discard') {
      // Remove oldest entries
      const entriesToRemove = Math.ceil(this.requests.size * 0.1); // Remove 10%
      const entries = Array.from(this.requests.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      );

      for (let i = 0; i < entriesToRemove; i++) {
        this.requests.delete(entries[i][0]);
      }
    } else if (action === 'compress') {
      // Mark old entries as compressed (in real implementation, would compress data)
      const oneHourAgo = Date.now() - 3600000;
      for (const [id, req] of this.requests.entries()) {
        if (req.timestamp < oneHourAgo) {
          // In production, would compress the data
          // For now, just remove very old items
          if (req.timestamp < Date.now() - this.config.ttl) {
            this.requests.delete(id);
          }
        }
      }
    }
  }

  /**
   * Clean up expired entries based on TTL
   */
  private cleanupExpired(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [id, request] of this.requests.entries()) {
      if (now - request.timestamp > this.config.ttl) {
        toDelete.push(id);
      }
    }

    toDelete.forEach(id => this.requests.delete(id));
  }

  /**
   * Get requests within time range
   */
  async getByTimeRange(startTime: number, endTime: number): Promise<TrackedRequest[]> {
    return this.query({ startTime, endTime });
  }

  /**
   * Get top endpoints by request count
   */
  async getTopEndpoints(limit: number = 10): Promise<{path: string; count: number}[]> {
    const requests = Array.from(this.requests.values());
    const pathCounts: Record<string, number> = {};

    requests.forEach(r => {
      pathCounts[r.path] = (pathCounts[r.path] || 0) + 1;
    });

    return Object.entries(pathCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([path, count]) => ({ path, count }));
  }
}
