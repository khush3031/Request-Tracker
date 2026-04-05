/**
 * NestJS integration for request-tracker-pro
 *
 * Two options:
 *
 * Option 1 — Middleware (tracks all routes automatically):
 *   Apply RequestTrackerMiddleware in AppModule
 *
 * Option 2 — Interceptor (per controller / per route):
 *   Apply @UseInterceptors(RequestTrackerInterceptor) on a controller or handler
 */

import { RequestTracker } from '../tracker.js';
import { TrackerConfig } from '../types.js';

// Shared singleton tracker
let _tracker: RequestTracker | null = null;
export function getTracker(config?: Partial<TrackerConfig>): RequestTracker {
  if (!_tracker) _tracker = new RequestTracker(config);
  return _tracker;
}

// ─────────────────────────────────────────────────────────────────────────────
// NestJS Middleware
// Works with @nestjs/common NestMiddleware interface without importing NestJS
// so this file compiles without NestJS installed (peer dep).
// ─────────────────────────────────────────────────────────────────────────────
export class RequestTrackerMiddleware {
  private tracker: RequestTracker;

  constructor(config?: Partial<TrackerConfig>) {
    this.tracker = getTracker(config);
  }

  use(req: any, res: any, next: () => void): void {
    // Skip internal tracker routes
    const path: string = req.path || req.url || '';
    if (path === '/request-tracker' || path.startsWith('/admin/request-tracker')) {
      return next();
    }

    const startTime = Date.now();
    const tracker = this.tracker;

    res.on('finish', () => {
      const duration = Date.now() - startTime;

      const requestHeaders = req.headers as Record<string, string>;
      const responseHeaders: Record<string, string> = {};
      try {
        const rawHeaders = res.getHeaders?.() ?? {};
        for (const [k, v] of Object.entries(rawHeaders)) {
          responseHeaders[k] = String(v);
        }
      } catch {}

      const trackedRequest = {
        id: `req-${startTime}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: startTime,
        method: req.method ?? 'GET',
        path: req.path || (req.url ?? '/').split('?')[0],
        fullUrl: `${req.protocol ?? 'http'}://${req.get?.('host') ?? req.headers?.host ?? 'localhost'}${req.originalUrl ?? req.url ?? '/'}`,
        statusCode: res.statusCode ?? 200,
        statusMessage: res.statusMessage ?? '',
        startTime,
        endTime: Date.now(),
        duration,
        requestSize: parseInt(req.headers?.['content-length'] ?? '0', 10),
        responseSize: parseInt(responseHeaders['content-length'] ?? '0', 10),
        networkUsage: 0,
        requestHeaders,
        responseHeaders,
        queryParams: req.query ?? {},
        requestBody: undefined,
        responseBody: undefined,
        userAgent: req.headers?.['user-agent'],
        ipAddress:
          (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
          req.ip ||
          req.socket?.remoteAddress ||
          '',
        custom: {}
      };

      trackedRequest.networkUsage = trackedRequest.requestSize + trackedRequest.responseSize;

      tracker['batch'].push(trackedRequest);
      if (tracker['batch'].length >= tracker['config'].batchSize) {
        tracker.flushBatch();
      }
    });

    next();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NestJS Interceptor (alternative to middleware, per-route granularity)
// ─────────────────────────────────────────────────────────────────────────────
export class RequestTrackerInterceptor {
  private tracker: RequestTracker;

  constructor(config?: Partial<TrackerConfig>) {
    this.tracker = getTracker(config);
  }

  intercept(context: any, next: any): any {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const startTime = Date.now();
    const tracker = this.tracker;

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      tracker['batch'].push({
        id: `req-${startTime}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: startTime,
        method: req.method,
        path: req.path || req.url?.split('?')[0],
        fullUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
        statusCode: res.statusCode,
        statusMessage: res.statusMessage ?? '',
        startTime,
        endTime: Date.now(),
        duration,
        requestSize: parseInt(req.headers['content-length'] ?? '0', 10),
        responseSize: 0,
        networkUsage: 0,
        requestHeaders: req.headers,
        responseHeaders: res.getHeaders?.() ?? {},
        queryParams: req.query ?? {},
        requestBody: undefined,
        responseBody: undefined,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip || req.socket?.remoteAddress || '',
        custom: {}
      });
      if (tracker['batch'].length >= tracker['config'].batchSize) tracker.flushBatch();
    });

    // next.handle() returns an Observable — pipe is optional, just pass through
    return next.handle();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard controller helper
// Register these in your NestJS controller or use the setupDashboard helper
// ─────────────────────────────────────────────────────────────────────────────
export async function handleTrackerRequest(req: any, res: any): Promise<void> {
  const tracker = getTracker();
  const url: string = req.url ?? '';

  if (url.includes('/stats')) {
    res.json(await tracker.getStats());
  } else if (url.includes('/recent')) {
    const limit = parseInt(req.query?.limit ?? '100', 10);
    res.json(await tracker.getRecentRequests(limit));
  } else if (url.includes('/slowest')) {
    res.json(await tracker.getSlowestRequests(20));
  } else if (url.includes('/errors')) {
    res.json(await tracker.getErroredRequests(20));
  } else if (url.includes('/export')) {
    const format = req.query?.format === 'csv' ? 'csv' : 'json';
    const data = await tracker.exportData(format);
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="requests.${format}"`);
    res.send(data);
  } else {
    // Default: full dashboard data
    res.json(await tracker.getDashboardData());
  }
}
