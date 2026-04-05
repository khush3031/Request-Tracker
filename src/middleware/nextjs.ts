import { RequestTracker } from '../tracker.js';
import { TrackerConfig } from '../types.js';

function headersToObject(headers: any): Record<string, string> {
  if (!headers) return {};
  if (typeof headers.forEach === 'function') {
    const obj: Record<string, string> = {};
    headers.forEach((value: string, key: string) => { obj[key] = value; });
    return obj;
  }
  return headers as Record<string, string>;
}

// Shared tracker instance (singleton per process)
let _tracker: RequestTracker | null = null;

function getTracker(config?: Partial<TrackerConfig>): RequestTracker {
  if (!_tracker) _tracker = new RequestTracker(config);
  return _tracker;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pages Router  (/pages/api/*)
// Usage:
//   export default withRequestTracker(handler)
//   export default withRequestTracker(handler, { storage: { primary: 'file' } })
// ─────────────────────────────────────────────────────────────────────────────
export function withRequestTracker(
  handler: (req: any, res: any) => any,
  config?: Partial<TrackerConfig>
) {
  const tracker = getTracker(config);
  return async (req: any, res: any) => {
    const startTime = Date.now();

    // Listen for finish — same as Express fix
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const path = req.url?.split('?')[0] ?? '/';

      tracker['batch'].push({
        id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: startTime,
        method: req.method ?? 'GET',
        path,
        fullUrl: `${req.headers['x-forwarded-proto'] ?? 'http'}://${req.headers.host}${req.url}`,
        statusCode: res.statusCode,
        statusMessage: res.statusMessage ?? '',
        startTime,
        endTime: Date.now(),
        duration,
        requestSize: parseInt(req.headers['content-length'] ?? '0', 10),
        responseSize: 0,
        networkUsage: 0,
        requestHeaders: req.headers,
        responseHeaders: {},
        queryParams: req.query,
        requestBody: undefined,
        responseBody: undefined,
        userAgent: req.headers['user-agent'],
        ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? '',
        custom: {}
      });

      if (tracker['batch'].length >= tracker['config'].batchSize) {
        tracker.flushBatch();
      }
    });

    return handler(req, res);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// App Router  (/app/api/*/route.ts)
// Usage:
//   export const GET = trackRoute(async (req) => { ... return NextResponse.json(...) })
// ─────────────────────────────────────────────────────────────────────────────
export function trackRoute(
  handler: (req: Request, ctx?: any) => Promise<Response>,
  config?: Partial<TrackerConfig>
) {
  const tracker = getTracker(config);

  return async (req: Request, ctx?: any): Promise<Response> => {
    const startTime = Date.now();
    let response: Response;

    try {
      response = await handler(req, ctx);
    } catch (err) {
      // Still track failed requests
      const duration = Date.now() - startTime;
      const url = new URL(req.url);
      tracker['batch'].push({
        id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: startTime,
        method: req.method,
        path: url.pathname,
        fullUrl: req.url,
        statusCode: 500,
        statusMessage: 'Internal Server Error',
        startTime,
        endTime: Date.now(),
        duration,
        requestSize: parseInt(req.headers.get('content-length') ?? '0', 10),
        responseSize: 0,
        networkUsage: 0,
        requestHeaders: headersToObject(req.headers),
        responseHeaders: {},
        queryParams: Object.fromEntries(url.searchParams.entries()),
        requestBody: undefined,
        responseBody: undefined,
        userAgent: req.headers.get('user-agent') ?? undefined,
        ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '',
        custom: {}
      });
      if (tracker['batch'].length >= tracker['config'].batchSize) tracker.flushBatch();
      throw err;
    }

    const duration = Date.now() - startTime;
    const url = new URL(req.url);
    const responseClone = response.clone();
    const responseText = await responseClone.text().catch(() => '');

    tracker['batch'].push({
      id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: startTime,
      method: req.method,
      path: url.pathname,
      fullUrl: req.url,
      statusCode: response.status,
      statusMessage: response.statusText,
      startTime,
      endTime: Date.now(),
      duration,
      requestSize: parseInt(req.headers.get('content-length') ?? '0', 10),
      responseSize: responseText.length,
      networkUsage: 0,
      requestHeaders: headersToObject(req.headers),
      responseHeaders: headersToObject(response.headers),
      queryParams: Object.fromEntries(url.searchParams.entries()),
      requestBody: undefined,
      responseBody: undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
      ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '',
      custom: {}
    });

    if (tracker['batch'].length >= tracker['config'].batchSize) tracker.flushBatch();
    return response;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard data API — add this as a Next.js API route to expose the dashboard
// Pages Router: pages/api/request-tracker/[...slug].ts
// App Router:   app/api/request-tracker/route.ts
// ─────────────────────────────────────────────────────────────────────────────
export async function requestTrackerApiHandler(req: any, res: any) {
  const tracker = getTracker();
  const url: string = req.url ?? '';

  if (url.includes('/data') || url.endsWith('/request-tracker')) {
    res.json(await tracker.getDashboardData());
  } else if (url.includes('/stats')) {
    res.json(await tracker.getStats());
  } else if (url.includes('/recent')) {
    res.json(await tracker.getRecentRequests(100));
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
    res.status(404).json({ error: 'Unknown endpoint' });
  }
}

export { getTracker };
