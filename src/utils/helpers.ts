import { TrackedRequest } from '../types';

/**
 * Helper utilities
 */

function getByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }

  const nodeBuffer = (globalThis as any)['Buffer'];
  if (nodeBuffer && typeof nodeBuffer.byteLength === 'function') {
    return nodeBuffer.byteLength(value, 'utf8');
  }

  return unescape(encodeURIComponent(value)).length;
}

function isBufferOrArrayBufferView(value: any): value is ArrayBuffer | ArrayBufferView {
  const nodeBuffer = (globalThis as any)['Buffer'];
  return (
    (nodeBuffer && typeof nodeBuffer.isBuffer === 'function' && nodeBuffer.isBuffer(value)) ||
    (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value))
  );
}

/**
 * Generate unique ID for request
 */
export function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get request size (from headers and body)
 */
export function getRequestSize(headers: Record<string, any>, body?: any): number {
  let size = 0;

  // Headers size
  if (headers) {
    size += JSON.stringify(headers).length;
  }

  // Body size
  if (body) {
    if (typeof body === 'string') {
      size += getByteLength(body);
    } else {
      size += getByteLength(JSON.stringify(body));
    }
  }

  return size;
}

/**
 * Get response size (from headers and body)
 */
export function getResponseSize(headers: Record<string, any>, body?: any): number {
  let size = 0;

  // Headers size
  if (headers) {
    size += JSON.stringify(headers).length;
  }

  // Body size
  if (body) {
    if (typeof body === 'string') {
      size += getByteLength(body);
    } else if (isBufferOrArrayBufferView(body)) {
      size += (body as ArrayBufferView).byteLength;
    } else {
      size += getByteLength(JSON.stringify(body));
    }
  }

  return size;
}

/**
 * Get client IP from request
 */
export function getClientIP(req: any): string {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.connection.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * Check if path matches any pattern
 */
export function matchesPattern(path: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(path));
}

/**
 * Calculate percentile value
 */
export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;

  const sorted = values.sort((a, b) => a - b);
  const index = (percentile / 100) * sorted.length;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) {
    return sorted[lower];
  }

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Sleep for given milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Deep clone object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as any;
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as any;
  }

  if (obj instanceof Object) {
    const clonedObj = {} as any;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }

  return obj;
}

/**
 * Get object size in bytes
 */
export function getObjectSize(obj: any): number {
  const json = JSON.stringify(obj);
  return getByteLength(json);
}

/**
 * Parse duration string to milliseconds
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/(\d+)\s*(ms|s|m|h|day|days)/i);
  if (!match) throw new Error(`Invalid duration format: ${duration}`);

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60000,
    h: 3600000,
    day: 86400000,
    days: 86400000
  };

  return value * (multipliers[unit] || 1);
}

/**
 * Extract fields from object
 */
export function extractFields(obj: any, fields: string[]): Record<string, any> {
  const result: Record<string, any> = {};
  fields.forEach(field => {
    if (field in obj) {
      result[field] = obj[field];
    }
  });
  return result;
}

/**
 * Merge multiple objects
 */
export function mergeObjects(...objects: any[]): Record<string, any> {
  return objects.reduce((acc, obj) => {
    if (obj && typeof obj === 'object') {
      Object.assign(acc, obj);
    }
    return acc;
  }, {});
}

/**
 * Get duration breakdown (for trends)
 */
export function getTimeGroup(timestamp: number, period: 'minute' | 'hour' | 'day'): number {
  const date = new Date(timestamp);

  switch (period) {
    case 'minute':
      date.setSeconds(0, 0);
      break;
    case 'hour':
      date.setMinutes(0, 0, 0);
      break;
    case 'day':
      date.setHours(0, 0, 0, 0);
      break;
  }

  return date.getTime();
}

/**
 * Group array by key
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce(
    (result, item) => {
      const group = String(item[key]);
      if (!result[group]) {
        result[group] = [];
      }
      result[group].push(item);
      return result;
    },
    {} as Record<string, T[]>
  );
}

/**
 * Calculate difference between two values with percentage
 */
export function calculatePercentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return 0;
  return ((newValue - oldValue) / oldValue) * 100;
}
