import { TrackedRequest, QueryOptions } from '../types';

/**
 * Base storage adapter interface
 */
export abstract class StorageAdapter {
  abstract save(request: TrackedRequest): Promise<void>;
  abstract get(id: string): Promise<TrackedRequest | null>;
  abstract query(options: QueryOptions): Promise<TrackedRequest[]>;
  abstract getAll(): Promise<TrackedRequest[]>;
  abstract delete(id: string): Promise<void>;
  abstract clear(): Promise<void>;
  abstract count(): Promise<number>;
  abstract export(format: 'json' | 'csv'): Promise<string>;

  /**
   * Batch save requests
   */
  async saveBatch(requests: TrackedRequest[]): Promise<void> {
    await Promise.all(requests.map(req => this.save(req)));
  }

  /**
   * Get statistics from stored data
   */
  async getStats() {
    const requests = await this.getAll();
    if (requests.length === 0) {
      return {
        totalRequests: 0,
        averageResponseTime: 0,
        statusDistribution: {}
      };
    }

    const durations = requests.map(r => r.duration);
    const totalDuration = durations.reduce((a, b) => a + b, 0);

    const statusDistribution: Record<number, number> = {};
    requests.forEach(r => {
      statusDistribution[r.statusCode] = (statusDistribution[r.statusCode] || 0) + 1;
    });

    return {
      totalRequests: requests.length,
      averageResponseTime: totalDuration / requests.length,
      statusDistribution
    };
  }
}

/**
 * Default implementation for common query logic
 */
export function applyQueryFilters(requests: TrackedRequest[], options: QueryOptions): TrackedRequest[] {
  let filtered = requests;

  if (options.method) {
    filtered = filtered.filter(r => r.method === options.method);
  }

  if (options.path) {
    filtered = filtered.filter(r => r.path === options.path);
  }

  if (options.statusCode) {
    if (typeof options.statusCode === 'number') {
      filtered = filtered.filter(r => r.statusCode === options.statusCode);
    } else {
      filtered = filtered.filter(r => {
        const code = r.statusCode;
        if (options.statusCode && typeof options.statusCode === 'object') {
          const min = options.statusCode.$gte ?? 0;
          const max = options.statusCode.$lte ?? 999;
          return code >= min && code <= max;
        }
        return true;
      });
    }
  }

  if (options.startTime) {
    filtered = filtered.filter(r => r.timestamp >= options.startTime!);
  }

  if (options.endTime) {
    filtered = filtered.filter(r => r.timestamp <= options.endTime!);
  }

  if (options.userId) {
    filtered = filtered.filter(r => r.userId === options.userId);
  }

  if (options.ipAddress) {
    filtered = filtered.filter(r => r.ipAddress === options.ipAddress);
  }

  if (options.minDuration) {
    filtered = filtered.filter(r => r.duration >= options.minDuration!);
  }

  if (options.maxDuration) {
    filtered = filtered.filter(r => r.duration <= options.maxDuration!);
  }

  if (options.errorOnly) {
    filtered = filtered.filter(r => r.statusCode >= 400);
  }

  // Sorting
  if (options.sort === 'asc') {
    filtered.sort((a, b) => a.timestamp - b.timestamp);
  } else {
    filtered.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Pagination
  if (options.offset) {
    filtered = filtered.slice(options.offset);
  }

  if (options.limit) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}
