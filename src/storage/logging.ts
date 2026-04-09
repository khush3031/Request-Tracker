import { StorageAdapter, applyQueryFilters } from './base.js';
import { TrackedRequest, LoggingOnlyConfig, QueryOptions } from '../types.js';
import { RequestFormatter } from '../utils/formatter.js';

/**
 * Logging-only storage adapter
 * Logs to console, file, or custom logger without persisting to database
 * Perfect for development, testing, or audit trails
 */
export class LoggingOnlyStorage extends StorageAdapter {
  private config: LoggingOnlyConfig;
  private logger: any;

  constructor(config: LoggingOnlyConfig) {
    super();
    this.config = config;
    this.logger = config.logger || console;
  }

  async save(request: TrackedRequest): Promise<void> {
    const message = this.formatMessage(request);
    this.logMessage(message, request);
  }

  async get(id: string): Promise<TrackedRequest | null> {
    // Logging-only doesn't store data
    return null;
  }

  async query(options: QueryOptions): Promise<TrackedRequest[]> {
    // Logging-only doesn't store data, so can't query
    return [];
  }

  async getAll(): Promise<TrackedRequest[]> {
    // Logging-only doesn't store data
    return [];
  }

  async delete(id: string): Promise<void> {
    // Nothing to delete in logging-only mode
  }

  async clear(): Promise<void> {
    // Nothing to clear in logging-only mode
  }

  async count(): Promise<number> {
    // Can't count in logging-only mode
    return 0;
  }

  async export(format: 'json' | 'csv'): Promise<string> {
    return '';
  }

  /**
   * Format message based on config
   */
  private formatMessage(request: TrackedRequest): string {
    if (this.config.customFormatter) {
      return this.config.customFormatter(request);
    }

    if (this.config.format === 'json') {
      return JSON.stringify(RequestFormatter.toJSON(request));
    }

    // Default: text format (also handles format === 'text' explicitly)
    return `[${RequestFormatter.formatTimestamp(request.timestamp)}] ${request.method} ${request.path} - ${request.statusCode} (${RequestFormatter.formatDuration(request.duration)}) - Network: ${RequestFormatter.formatBytes(request.networkUsage)}`;
  }

  /**
   * Log message using appropriate logger
   */
  private logMessage(message: string, request: TrackedRequest): void {
    // Determine log level based on status code
    let level: string = this.config.level || 'info';

    if (request.statusCode >= 500) {
      level = 'error';
    } else if (request.statusCode >= 400) {
      level = 'warn';
    }

    const customLogger = this.config.logger;

    // Winston-like logger (has .log(level, message) signature)
    if (customLogger && typeof customLogger.log === 'function') {
      customLogger.log(level, message);
    } else if (customLogger && typeof customLogger[level] === 'function') {
      // Custom logger with level methods (e.g. { info, warn, error })
      customLogger[level](message);
    } else {
      // Fallback: plain console — pick the right method by level
      const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
      (console as any)[consoleMethod](message);
    }
  }

  /**
   * Get a sample of what would be logged
   */
  getSampleLog(request: TrackedRequest): string {
    return this.formatMessage(request);
  }

  /**
   * Test the logger configuration
   */
  async testLogger(): Promise<boolean> {
    try {
      const testMessage = '[LOGGER TEST] Request Tracker logging is working correctly';
      if (this.logger?.info) {
        this.logger.info(testMessage);
      } else {
        (console as any).log(testMessage);
      }
      return true;
    } catch {
      return false;
    }
  }
}
