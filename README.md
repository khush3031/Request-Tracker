# request-tracker-pro

HTTP request tracking and analytics middleware for Node.js. Drop one line into your app and get a live dashboard showing latency, bandwidth, error rates, and every request — persisted across restarts.

Works with **Express**, **NestJS**, and **Next.js**.

---

## Features

- **Live dashboard** at `/request-tracker` — dark-themed, auto-refreshes every 10s
- **Persistent storage** — requests survive server restarts (saved to a local JSON file)
- **Time-range filtering** — 5 min / 10 min / 1 hour / 6 hours / All
- **P95 latency** with plain-English labels ("Good — feels instant to users")
- **Endpoint grouping** — groups `/api/users`, `/api/users/:id` under `/api/users`
- **Search & filter** — search by path, filter by HTTP method
- **Show more** — paginated endpoint list and request log
- **Last accessed** tracking — shows when you last opened the dashboard
- **CSV / JSON export** via API
- Zero external dependencies for core tracking

---

## Installation

```bash
npm install request-tracker-pro
```

---

## Quick Start

### Express

```js
const express = require('express');
const { setupRequestTracker } = require('request-tracker-pro');

const app = express();
app.use(express.json());

setupRequestTracker(app, {
  storage: { primary: 'file' } // persists across restarts
});

app.get('/api/users', (req, res) => res.json({ users: [] }));

app.listen(3000);
// Dashboard: http://localhost:3000/request-tracker
```

### NestJS

```ts
// app.module.ts
import { Module, MiddlewareConsumer } from '@nestjs/common';
import { RequestTrackerMiddleware } from 'request-tracker-pro/middleware';

@Module({})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    const mw = new RequestTrackerMiddleware({ storage: { primary: 'file' } });
    consumer
      .apply((req, res, next) => mw.use(req, res, next))
      .forRoutes('*');
  }
}
```

```ts
// main.ts — add dashboard routes to the underlying Express instance
import { setupRequestTracker } from 'request-tracker-pro';

const app = await NestFactory.create(AppModule);
const httpAdapter = app.get(HttpAdapterHost).httpAdapter;
setupRequestTracker(httpAdapter.getInstance());
await app.listen(3000);
// Dashboard: http://localhost:3000/request-tracker
```

### Next.js — Pages Router

```ts
// pages/api/users.ts
import { withRequestTracker } from 'request-tracker-pro/middleware';

async function handler(req, res) {
  res.json({ users: [] });
}

export default withRequestTracker(handler, { storage: { primary: 'file' } });
```

```ts
// pages/api/request-tracker/[...slug].ts
import { requestTrackerApiHandler } from 'request-tracker-pro/middleware';
export default requestTrackerApiHandler;
```

### Next.js — App Router

```ts
// app/api/users/route.ts
import { trackRoute } from 'request-tracker-pro/middleware';
import { NextResponse } from 'next/server';

export const GET = trackRoute(async () => {
  return NextResponse.json({ users: [] });
});
```

---

## Dashboard

Visit `http://localhost:3000/request-tracker` after starting your server.

![Dashboard](https://via.placeholder.com/900x500/1e293b/6366f1?text=Request+Tracker+Dashboard)

| Section | Description |
|---|---|
| Stats cards | Total requests, avg latency, P95, error rate, bandwidth |
| Latency chart | Response time over last N requests |
| API Endpoints | Grouped by base path, searchable, show more |
| Recent Requests | All requests, paginated (25 at a time) |
| Slowest Requests | Top 50 slowest across selected time range |

---

## Configuration

```js
setupRequestTracker(app, {
  // What to track
  trackHeaders: true,
  trackBody: false,
  trackQueryParams: true,
  trackUserInfo: false,

  // Exclude paths (tracker routes are always excluded automatically)
  excludedPaths: ['/health', '/metrics'],

  // Mask sensitive fields in logs
  maskSensitiveFields: ['password', 'token', 'apiKey'],

  // Anonymize IPs (192.168.1.100 → 192.168.1.***)
  anonymizeIP: false,

  // Storage — 'file' recommended (persists across restarts)
  storage: {
    primary: 'file',   // 'file' | 'memory' | 'logging-only'
  },

  // Hook into every tracked request
  onRequest: (data) => {
    if (data.duration > 1000) {
      console.warn(`Slow: ${data.path} ${data.duration}ms`);
    }
  }
});
```

### Storage options

| Option | Description |
|---|---|
| `file` | Saves to `.request-tracker-data.json` in project root. Survives restarts. **Recommended.** |
| `memory` | In-RAM only. Fast but lost on restart. |
| `logging-only` | Prints to console/logger, no storage. |

---

## JSON API Endpoints

These are added automatically to your app:

| Endpoint | Description |
|---|---|
| `GET /request-tracker` | HTML dashboard |
| `GET /admin/request-tracker/data` | Full dashboard JSON |
| `GET /admin/request-tracker/stats` | Stats summary |
| `GET /admin/request-tracker/recent?limit=100` | Recent requests |
| `GET /admin/request-tracker/slowest?limit=20` | Slowest requests |
| `GET /admin/request-tracker/errors?limit=20` | Errored requests |
| `GET /admin/request-tracker/export?format=csv` | Export as CSV |
| `GET /admin/request-tracker/export?format=json` | Export as JSON |

---

## What gets tracked per request

```js
{
  id: "req-1712315445000-a1b2c3",
  timestamp: 1712315445000,
  method: "POST",
  path: "/api/users",
  fullUrl: "http://localhost:3000/api/users",
  statusCode: 201,
  duration: 145,          // ms
  requestSize: 256,       // bytes
  responseSize: 1024,     // bytes
  networkUsage: 1280,     // total bytes
  userAgent: "Mozilla/5.0...",
  ipAddress: "127.0.0.1",
  queryParams: {},
  requestHeaders: { ... },
  responseHeaders: { ... }
}
```

---

## P95 Latency explained

P95 means "95 out of 100 requests complete within this time". The dashboard shows a plain-English label:

| Value | Label |
|---|---|
| ≤ 100ms | Excellent — requests are very fast |
| ≤ 300ms | Good — feels instant to users |
| ≤ 600ms | Acceptable — most users won't notice |
| ≤ 1000ms | Slow — some users may notice a delay |
| > 1000ms | Poor — requests taking over 1 second |

---

## Security

The tracker automatically excludes its own routes (`/request-tracker`, `/admin/request-tracker/*`) from being tracked so they don't flood your logs.

For production, protect the dashboard behind auth middleware:

```js
app.use('/request-tracker', requireAdminAuth);
app.use('/admin/request-tracker', requireAdminAuth);
setupRequestTracker(app, { ... });
```

---

## Running the example

```bash
git clone https://github.com/YOUR_USERNAME/request-tracker-pro
cd request-tracker-pro
npm install
npm run build
node examples/express-basic.js
```

Then visit `http://localhost:3000/request-tracker` and hit some routes:

```
http://localhost:3000/api/users
http://localhost:3000/api/products
http://localhost:3000/api/orders
http://localhost:3000/api/analytics/summary
http://localhost:3000/api/error/500
```

---

## License

MIT
