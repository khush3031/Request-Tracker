import { TrackedRequest } from '../types.js';

/**
 * Formatter utilities for request data
 */

export class RequestFormatter {
  /**
   * Get human-readable size (bytes to KB, MB, etc.)
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
  }

  /**
   * Get status code category (2xx, 3xx, 4xx, 5xx)
   */
  static getStatusCategory(statusCode: number): string {
    const category = Math.floor(statusCode / 100);
    const categories: Record<number, string> = {
      2: 'Success',
      3: 'Redirect',
      4: 'Client Error',
      5: 'Server Error'
    };
    return categories[category] || 'Unknown';
  }

  /**
   * Get status severity level
   */
  static getStatusSeverity(statusCode: number): 'info' | 'warning' | 'error' | 'critical' {
    if (statusCode < 400) return 'info';
    if (statusCode < 500) return 'warning';
    if (statusCode < 600) return 'error';
    return 'critical';
  }

  /**
   * Format duration in human-readable format
   */
  static formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  }

  /**
   * Format timestamp to readable date
   */
  static formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toISOString();
  }

  /**
   * Mask sensitive data in request
   */
  static maskSensitiveData(
    request: TrackedRequest,
    sensitiveFields: string[]
  ): TrackedRequest {
    const masked = { ...request };

    const maskObject = (obj: any): any => {
      if (!obj) return obj;
      const result = { ...obj };
      for (const field of sensitiveFields) {
        if (field in result) {
          result[field] = '***MASKED***';
        }
      }
      return result;
    };

    if (masked.queryParams) {
      masked.queryParams = maskObject(masked.queryParams);
    }
    if (masked.requestBody && typeof masked.requestBody === 'object') {
      masked.requestBody = maskObject(masked.requestBody);
    }
    if (masked.requestHeaders) {
      masked.requestHeaders = maskObject(masked.requestHeaders);
    }

    return masked;
  }

  /**
   * Anonymize IP address
   */
  static anonymizeIP(ip: string): string {
    if (!ip) return 'unknown';
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
    }
    // IPv6
    return ip.replace(/:[^:]*$/, ':***');
  }

  /**
   * Convert request to JSON with formatting
   */
  static toJSON(request: TrackedRequest): Record<string, any> {
    return {
      id: request.id,
      timestamp: this.formatTimestamp(request.timestamp),
      method: request.method,
      path: request.path,
      statusCode: request.statusCode,
      statusMessage: request.statusMessage,
      statusCategory: this.getStatusCategory(request.statusCode),
      duration: `${request.duration}ms`,
      formattedDuration: this.formatDuration(request.duration),
      networkUsage: {
        bytes: request.networkUsage,
        formatted: this.formatBytes(request.networkUsage),
        request: this.formatBytes(request.requestSize),
        response: this.formatBytes(request.responseSize)
      },
      user: {
        id: request.userId,
        sessionId: request.sessionId,
        ipAddress: request.ipAddress
      }
    };
  }

  /**
   * Convert request to CSV row
   */
  static toCSV(request: TrackedRequest): string {
    return [
      request.id,
      request.timestamp,
      request.method,
      request.path,
      request.statusCode,
      request.duration,
      request.networkUsage,
      request.requestSize,
      request.responseSize,
      request.userId || '',
      request.ipAddress || ''
    ]
      .map(field => (typeof field === 'string' && field.includes(',') ? `"${field}"` : field))
      .join(',');
  }

  /**
   * Get CSV header
   */
  static getCSVHeader(): string {
    return 'ID,Timestamp,Method,Path,StatusCode,Duration(ms),NetworkUsage(bytes),RequestSize(bytes),ResponseSize(bytes),UserID,IPAddress';
  }
}

/**
 * Color codes for console output
 */
export const ConsoleColors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Pretty print request data
 */
export function prettyPrintRequest(request: TrackedRequest): void {
  const severity = RequestFormatter.getStatusSeverity(request.statusCode);
  const colors: Record<string, string> = {
    info: ConsoleColors.blue,
    warning: ConsoleColors.yellow,
    error: ConsoleColors.red,
    critical: ConsoleColors.red
  };

  const color = colors[severity] || ConsoleColors.reset;

  console.log(`
${color}${ConsoleColors.bright}[${RequestFormatter.formatTimestamp(request.timestamp)}]${ConsoleColors.reset}
  ${request.method} ${request.path}
  Status: ${color}${request.statusCode}${ConsoleColors.reset} (${RequestFormatter.getStatusCategory(request.statusCode)})
  Duration: ${RequestFormatter.formatDuration(request.duration)}
  Network: ${RequestFormatter.formatBytes(request.networkUsage)} (Request: ${RequestFormatter.formatBytes(request.requestSize)}, Response: ${RequestFormatter.formatBytes(request.responseSize)})
  User: ${request.userId || 'Anonymous'}
  IP: ${request.ipAddress || 'Unknown'}
`);
}
