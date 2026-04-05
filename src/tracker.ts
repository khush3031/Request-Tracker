import { StorageAdapter } from './storage/base.js';
import { MemoryStorage } from './storage/memory.js';
import { FileStorage } from './storage/file.js';
import { LoggingOnlyStorage } from './storage/logging.js';
import { RequestAnalyzer } from './analytics/analyzer.js';
import { RequestFormatter } from './utils/formatter';
import { generateRequestId, getRequestSize, getResponseSize, getClientIP, parseDuration } from './utils/helpers';
import {
  TrackedRequest,
  TrackerConfig,
  StorageType,
  RequestStats,
  DashboardData,
  QueryOptions,
  RequestTrackerInstance,
  ClearOptions,
  CompressOptions,
  EndpointStats,
  NetworkAnalytics,
  LogLevel
} from './types';

/**
 * Main Request Tracker Class
 * Tracks HTTP requests with detailed metrics and flexible storage
 */
export class RequestTracker implements RequestTrackerInstance {
  private storage: StorageAdapter;
  private config: TrackerConfig;
  private batch: TrackedRequest[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Partial<TrackerConfig> = {}) {
    // Default configuration
    this.config = {
      trackHeaders: config.trackHeaders ?? true,
      trackBody: config.trackBody ?? false,
      trackQueryParams: config.trackQueryParams ?? true,
      trackUserInfo: config.trackUserInfo ?? true,
      excludedPaths: config.excludedPaths ?? ['/health', '/ping'],
      excludedPathPatterns: config.excludedPathPatterns ?? [],
      maxBodySize: config.maxBodySize ?? 10000,
      maxHeaderSize: config.maxHeaderSize ?? 5000,
      maskSensitiveFields: config.maskSensitiveFields ?? ['password', 'token', 'apiKey', 'secret'],
      anonymizeIP: config.anonymizeIP ?? false,
      storage: config.storage ?? {
        primary: StorageType.MEMORY,
        memory: {
          maxSize: 5000,
          ttl: 3600000,
          enableCompression: true,
          onMaxReached: 'discard'
        }
      },
      onRequest: config.onRequest,
      onError: config.onError,
      batchSize: config.batchSize ?? 1,
      flushInterval: config.flushInterval ?? 5000
    };

    // Initialize storage
    this.storage = this.initializeStorage();

    // Start auto-flush timer
    this.startAutoFlush();
  }

  /**
   * Initialize storage adapter based on configuration
   */
  private initializeStorage(): StorageAdapter {
    const storageConfig = this.config.storage;

    switch (storageConfig.primary) {
      case StorageType.MEMORY:
        return new MemoryStorage(
          storageConfig.memory || {
            maxSize: 5000,
            ttl: 3600000,
            enableCompression: true,
            onMaxReached: 'discard'
          }
        );

      case StorageType.LOGGING:
        return new LoggingOnlyStorage(
          storageConfig.loggingOnly || {
            logger: (typeof console !== 'undefined' ? console : undefined),
            format: 'text' as const,
            level: LogLevel.INFO,
            includeFields: []
          }
        );

      case StorageType.FILE:
        return new FileStorage(storageConfig.file ? { filePath: storageConfig.file.path } : {});

      default:
        // Default to file storage so data persists across restarts
        return new FileStorage({});
    }
  }

  /**
   * Express middleware function
   */
  middleware() {
    return (req: any, res: any, next: any) => {
      // Skip excluded paths
      if (this.shouldSkipTracking(req.path)) {
        return next();
      }

      const tracker = this;
      const requestId = generateRequestId();
      const startTime = Date.now();

      // Use the response 'finish' event — fires reliably in all Express versions
      res.on('finish', () => {
        const endTime = Date.now();
        const duration = endTime - startTime;

        const requestHeaders = tracker.config.trackHeaders
          ? tracker.getHeadersObject(req.headers)
          : undefined;

        const responseHeaders = tracker.config.trackHeaders
          ? tracker.getHeadersObject(res.getHeaders ? res.getHeaders() : {})
          : undefined;

        const requestBody =
          tracker.config.trackBody && req.body
            ? tracker.truncateData(req.body, tracker.config.maxBodySize)
            : undefined;

        const trackedRequest: TrackedRequest = {
          id: requestId,
          timestamp: startTime,
          method: req.method,
          path: req.path || req.url,
          fullUrl: `${req.protocol}://${req.get('host')}${req.originalUrl || req.url}`,
          statusCode: res.statusCode,
          statusMessage: res.statusMessage || '',
          startTime,
          endTime,
          duration,
          requestSize: getRequestSize(requestHeaders ?? {}, requestBody),
          responseSize: getResponseSize(responseHeaders ?? {}, undefined),
          networkUsage: 0,
          requestHeaders,
          responseHeaders,
          queryParams: tracker.config.trackQueryParams ? req.query : undefined,
          requestBody,
          responseBody: undefined,
          userId: tracker.config.trackUserInfo ? req.user?.id : undefined,
          sessionId: tracker.config.trackUserInfo ? req.sessionID : undefined,
          userAgent: req.get('user-agent'),
          ipAddress: tracker.config.anonymizeIP
            ? RequestFormatter.anonymizeIP(getClientIP(req))
            : getClientIP(req),
          custom: {}
        };

        trackedRequest.networkUsage = trackedRequest.requestSize + trackedRequest.responseSize;

        if (tracker.config.maskSensitiveFields.length > 0) {
          Object.assign(
            trackedRequest,
            RequestFormatter.maskSensitiveData(trackedRequest, tracker.config.maskSensitiveFields)
          );
        }

        if (tracker.config.onRequest) {
          try { tracker.config.onRequest(trackedRequest); } catch {}
        }

        tracker.batch.push(trackedRequest);
        if (tracker.batch.length >= tracker.config.batchSize) {
          tracker.flushBatch();
        }
      });

      next();
    };
  }

  /**
   * Get current statistics
   */
  async getStats(): Promise<RequestStats> {
    const requests = await this.storage.getAll();
    return RequestAnalyzer.analyzeRequests(requests);
  }

  /**
   * Get dashboard data
   */
  async getDashboardData(): Promise<DashboardData> {
    // Flush pending batch so dashboard always shows latest requests
    await this.flushBatch();
    const requests = await this.storage.getAll();
    const stats = RequestAnalyzer.analyzeRequests(requests);
    const recentRequests = requests.sort((a, b) => b.timestamp - a.timestamp);
    const slowestRequests = [...requests].sort((a, b) => b.duration - a.duration).slice(0, 50);
    const erroredRequests = requests
      .filter(r => r.statusCode >= 400)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);

    const networkUsageByEndpoint = RequestAnalyzer.getTopEndpoints(requests, 10).map(ep => ({
      path: `${ep.method} ${ep.path}`,
      usage: ep.totalNetworkUsage
    }));

    const latencyTrends = RequestAnalyzer.getLatencyTrends(requests, 'hour');

    return {
      stats,
      recentRequests,
      slowestRequests,
      erroredRequests,
      networkUsageByEndpoint,
      latencyTrends
    };
  }

  /**
   * Query requests
   */
  async query(options: QueryOptions): Promise<TrackedRequest[]> {
    return this.storage.query(options);
  }

  /**
   * Get recent requests
   */
  async getRecentRequests(limit: number = 100): Promise<TrackedRequest[]> {
    return this.query({ limit, sort: 'desc' });
  }

  /**
   * Get slowest requests
   */
  async getSlowestRequests(limit: number = 10): Promise<TrackedRequest[]> {
    const requests = await this.storage.getAll();
    return requests.sort((a, b) => b.duration - a.duration).slice(0, limit);
  }

  /**
   * Get errored requests
   */
  async getErroredRequests(limit: number = 10): Promise<TrackedRequest[]> {
    return this.query({ errorOnly: true, limit, sort: 'desc' });
  }

  /**
   * Get top endpoints
   */
  async getTopEndpoints(limit: number = 10): Promise<EndpointStats[]> {
    const requests = await this.storage.getAll();
    return RequestAnalyzer.getTopEndpoints(requests, limit);
  }

  /**
   * Get network analytics
   */
  async getNetworkAnalytics(path?: string): Promise<NetworkAnalytics> {
    const requests = await this.storage.getAll();
    return RequestAnalyzer.getNetworkAnalytics(requests, path);
  }

  /**
   * Clear old records
   */
  async clearOldRecords(options: ClearOptions): Promise<void> {
    const duration = parseDuration(options.olderThan);
    const cutoffTime = Date.now() - duration;

    const requests = await this.storage.query({ endTime: cutoffTime });

    for (const request of requests) {
      await this.storage.delete(request.id);
    }
  }

  /**
   * Compress records
   */
  async compressRecords(options: CompressOptions): Promise<void> {
    // In production, would compress older records
    // For now, just remove very old data
    const duration = parseDuration(options.before);
    const cutoffTime = Date.now() - duration;

    const requests = await this.storage.query({ endTime: cutoffTime });

    for (const request of requests) {
      await this.storage.delete(request.id);
    }
  }

  /**
   * Export data
   */
  async exportData(format: 'json' | 'csv'): Promise<string> {
    return this.storage.export(format);
  }

  /**
   * Clear all data
   */
  async clearAll(): Promise<void> {
    await this.storage.clear();
  }

  /**
   * Private helper methods
   */

  private shouldSkipTracking(path: string): boolean {
    // Always skip internal tracker routes
    if (path === '/request-tracker' || path.startsWith('/admin/request-tracker')) {
      return true;
    }

    // Check exact matches
    if (this.config.excludedPaths.includes(path)) {
      return true;
    }

    // Check patterns
    for (const pattern of this.config.excludedPathPatterns) {
      if (pattern.test(path)) {
        return true;
      }
    }

    return false;
  }

  private getHeadersObject(headers: any): Record<string, string> {
    const result: Record<string, string> = {};

    if (typeof headers?.entries === 'function') {
      for (const [key, value] of headers.entries()) {
        result[key] = String(value);
      }
    } else if (typeof headers === 'object') {
      for (const [key, value] of Object.entries(headers)) {
        result[key] = String(value);
      }
    }

    return result;
  }

  private truncateData(data: any, maxSize: number): any {
    const json = JSON.stringify(data);
    if (json.length > maxSize) {
      return JSON.parse(json.slice(0, maxSize));
    }
    return data;
  }

  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      if (this.batch.length > 0) {
        this.flushBatch();
      }
    }, this.config.flushInterval);
  }

  async flushBatch(): Promise<void> {
    if (this.batch.length === 0) return;

    const toFlush = [...this.batch];
    this.batch = [];

    try {
      await this.storage.saveBatch(toFlush);
    } catch (error) {
      if (typeof console !== 'undefined') {
        (console as any).error('Error flushing batch:', error);
      }
      // Re-add to batch for retry
      this.batch.unshift(...toFlush);
    }
  }

  /**
   * Cleanup on module unload
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushBatch();
  }

  /**
   * Get current config (for debugging)
   */
  getConfig(): Readonly<TrackerConfig> {
    return Object.freeze({ ...this.config });
  }
}

// Export singleton instance
export const tracker = new RequestTracker();

export default RequestTracker;
