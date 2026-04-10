# request-tracker-pro

HTTP request tracking and analytics middleware for Node.js. Drop one line into your app and get a live dashboard showing latency, bandwidth, error rates, and every request — with flexible, multi-adapter storage.

Works with **Express**, **NestJS**, and **Next.js**. Supports **ESM** (`import`) and **CommonJS** (`require`).

---

## Features

- **Live dashboard** at `/request-tracker` — dark-themed, auto-refreshes every 10 s
- **Multi-storage** — write to multiple backends simultaneously (file + MongoDB + console, etc.)
- **Route-specific storage** — send `/api/payments` to MongoDB, `/api/auth/**` to a file audit log, everything else to memory
- **Persistent storage** — file, MongoDB, and PostgreSQL adapters survive server restarts
- **Time-range filtering** — 5 min / 10 min / 1 h / 6 h / All
- **P95 latency** with plain-English labels ("Good — feels instant to users")
- **Endpoint grouping** — groups `/api/users/:id` under `/api/users`
- **Search & filter** — by path and HTTP method
- **CSV / JSON export** via API
- Zero required peer dependencies for core tracking

---

## Installation

```bash
npm install request-tracker-pro
```

Optional peer deps (only needed when using those adapters):

```bash
npm install mongodb   # for MongoDB storage
npm install pg        # for PostgreSQL storage
```

---

## Quick Start

### Express — ESM

```js
import express from 'express';
import { setupRequestTracker } from 'request-tracker-pro';

const app = express();
app.use(express.json());

setupRequestTracker(app, {
  storage: { primary: 'file' }   // persists across restarts
});

app.listen(3000);
// Dashboard → http://localhost:3000/request-tracker
```

### Express — CommonJS

```js
const express = require('express');
const { setupRequestTracker } = require('request-tracker-pro');

const app = express();
app.use(express.json());

setupRequestTracker(app, {
  storage: { primary: 'file' }
});

app.listen(3000);
```

### NestJS

```ts
// app.module.ts
import { Module, MiddlewareConsumer } from '@nestjs/common';
import { RequestTrackerMiddleware } from 'request-tracker-pro';

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
// main.ts — mount dashboard routes
import { NestFactory } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';
import { setupRequestTracker } from 'request-tracker-pro';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const { httpAdapter } = app.get(HttpAdapterHost);
  setupRequestTracker(httpAdapter.getInstance());
  await app.listen(3000);
  // Dashboard → http://localhost:3000/request-tracker
}
bootstrap();
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

| Section | Description |
|---|---|
| Stats cards | Total requests, avg latency, P95, error rate, bandwidth |
| Latency chart | Response time over the last N requests |
| API Endpoints | Grouped by base path, searchable |
| Recent Requests | All requests, paginated (25 at a time) |
| Slowest Requests | Top 50 slowest in the selected time range |

---

## Configuration

```js
setupRequestTracker(app, {
  // What to track
  trackHeaders:    true,
  trackBody:       false,
  trackQueryParams: true,

  // Exclude paths (tracker routes are always excluded automatically)
  excludedPaths: ['/health', '/metrics'],

  // Mask sensitive fields in logs
  maskSensitiveFields: ['password', 'token', 'apiKey'],

  // Anonymize IPs  192.168.1.100 → 192.168.1.***
  anonymizeIP: false,

  // Storage — see "Storage" section below
  storage: { primary: 'file' },

  // Hook into every tracked request
  onRequest: (data) => {
    if (data.duration > 1000) console.warn(`Slow: ${data.path} ${data.duration}ms`);
  }
});
```

---

## Storage

### Single adapter (simple)

Pass a `primary` key with one of the adapter names:

```js
storage: { primary: 'file' }
storage: { primary: 'memory' }
storage: { primary: 'logging-only' }
storage: { primary: 'mongodb', mongodb: { uri: 'mongodb://localhost:27017/mydb' } }
storage: { primary: 'postgresql', postgresql: { uri: 'postgresql://user:pass@localhost/mydb' } }
```

### Multiple adapters (recommended for production)

Use the `adapters` array to write to **all** listed backends simultaneously. Reads fall through to the first adapter that has data.

```js
storage: {
  adapters: [
    // Print every request to console
    { type: 'logging-only', format: 'text' },

    // Persist to a local JSON file (survives restarts)
    { type: 'file', path: './logs/requests.json' },

    // Also keep the latest 1 000 requests in RAM for fast dashboard queries
    { type: 'memory', maxSize: 1000 },

    // Long-term storage in MongoDB
    { type: 'mongodb', uri: 'mongodb://localhost:27017/mydb', collection: 'requests', ttlDays: 30 },

    // Or PostgreSQL
    { type: 'postgresql', uri: 'postgresql://user:pass@localhost/mydb', table: 'requests' },
  ]
}
```

If a peer dependency (`mongodb`, `pg`) is missing, that adapter is silently disabled with a console warning — the other adapters keep working.

---

### Adapter options

#### `memory`

| Option | Type | Default | Description |
|---|---|---|---|
| `maxSize` | `number` | `5000` | Max requests kept in RAM |
| `ttl` | `number` | `3600000` | Time-to-live in ms (1 h) |
| `onMaxReached` | `'discard'` \| `'compress'` | `'discard'` | What to do when full |

```js
{ type: 'memory', maxSize: 2000, ttl: 1800000 }
```

#### `file`

| Option | Type | Default | Description |
|---|---|---|---|
| `path` | `string` | `./.request-tracker-data.json` | Path to JSON file |
| `maxSize` | `number` | `50000` | Max requests per file |
| `flushIntervalMs` | `number` | `5000` | How often to write to disk |

```js
{ type: 'file', path: './logs/tracker.json', maxSize: 10000 }
```

#### `logging-only`

| Option | Type | Default | Description |
|---|---|---|---|
| `format` | `'text'` \| `'json'` | `'text'` | Log line format |
| `logger` | `object` | `console` | Winston-compatible logger |
| `level` | `'info'` \| `'warn'` \| `'error'` | `'info'` | Base log level |
| `customFormatter` | `(data) => string` | — | Override formatting entirely |

```js
{ type: 'logging-only', format: 'json', logger: winstonLogger }
```

#### `mongodb`

Requires: `npm install mongodb`

| Option | Type | Default | Description |
|---|---|---|---|
| `uri` | `string` | — | MongoDB connection string |
| `connection` | `object` | — | Existing Mongoose/MongoClient connection |
| `collection` | `string` | `'request_tracker_logs'` | Collection name |
| `ttlDays` | `number` | `30` | Auto-delete documents older than N days |

```js
{ type: 'mongodb', uri: 'mongodb://localhost:27017/mydb', ttlDays: 7 }
// or pass an existing mongoose connection:
{ type: 'mongodb', connection: mongoose.connection, collection: 'http_logs' }
```

#### `postgresql`

Requires: `npm install pg`

| Option | Type | Default | Description |
|---|---|---|---|
| `uri` | `string` | — | PostgreSQL connection string |
| `connection` | `object` | — | Existing `pg.Pool` / `pg.Client` |
| `table` | `string` | `'request_tracker_logs'` | Table name (auto-created) |
| `ttlDays` | `number` | `30` | Auto-delete rows older than N days |

```js
{ type: 'postgresql', uri: 'postgresql://user:pass@localhost:5432/mydb' }
// or pass an existing pool:
{ type: 'postgresql', connection: pgPool, table: 'http_logs' }
```

---

## Route-Specific Storage

Send individual endpoints to a **dedicated storage adapter** instead of the global one. Rules are evaluated in order — the first match wins. Unmatched requests fall through to the global `storage` config unchanged.

```js
setupRequestTracker(app, {
  // Global default — used when no route rule matches
  storage: { adapters: [{ type: 'memory', maxSize: 1000 }] },

  routes: [
    // Payments (POST/PUT only) → MongoDB for compliance
    {
      path:      '/api/payments',
      methods:   ['POST', 'PUT'],
      trackBody: true,
      storage:   { type: 'mongodb', uri: 'mongodb://localhost:27017/mydb', collection: 'payments_log' }
    },

    // All auth routes → dedicated file audit log, always capture body
    {
      path:      '/api/auth/**',
      trackBody: true,
      storage:   { type: 'file', path: './logs/auth-audit.json' }
    },

    // Admin routes → fan-out to PostgreSQL + console
    {
      path:    /^\/api\/admin/,
      storage: [
        { type: 'postgresql', uri: 'postgresql://user:pass@localhost/mydb' },
        { type: 'logging-only', format: 'json' }
      ]
    },

    // Orders → console only, no persistence
    {
      path:    '/api/orders*',
      storage: { type: 'logging-only', format: 'text' }
    }
  ]
});
```

### RouteRule options

| Option | Type | Required | Description |
|---|---|---|---|
| `path` | `string \| RegExp` | Yes | Path to match (exact, glob, or RegExp) |
| `methods` | `string[]` | No | HTTP methods to match — omit to match all methods |
| `storage` | `AdapterConfig \| AdapterConfig[]` | Yes | One adapter or an array (fan-out) |
| `trackBody` | `boolean` | No | Override global `trackBody` for this route |
| `trackHeaders` | `boolean` | No | Override global `trackHeaders` for this route |
| `maskSensitiveFields` | `string[]` | No | Override global mask list for this route |

### Path pattern syntax

| Pattern | Matches | Does not match |
|---|---|---|
| `'/api/users'` | `/api/users` only | `/api/users/1` |
| `'/api/users/*'` | `/api/users/1` | `/api/users/1/profile` |
| `'/api/users/**'` | `/api/users/1`, `/api/users/1/profile` | `/api/users` (bare) |
| `'/api/users*'` | `/api/users`, `/api/users/1`, `/api/users/1/profile` | `/api/products` |
| `/^\/api\/admin/` | `/api/admin`, `/api/admin/anything` | `/api/users` |

> **Tip:** Use `'/api/orders*'` (single `*` at end) when you want to match both the bare path `/api/orders` **and** all sub-paths like `/api/orders/123`.

### Per-route config overrides

`trackBody`, `trackHeaders`, and `maskSensitiveFields` on a rule override the global config **only for requests matched by that rule**. All other global settings (masking, IP anonymization, `onRequest` callback, etc.) still apply normally.

```js
setupRequestTracker(app, {
  trackBody: false,           // global default: don't capture body
  maskSensitiveFields: ['password', 'token'],

  routes: [
    {
      path:                '/api/auth/**',
      trackBody:           true,        // capture body only for auth routes
      maskSensitiveFields: ['password', 'token', 'otp', 'refreshToken'],
      storage:             { type: 'file', path: './logs/auth.json' }
    }
  ]
});
```

---

## JSON API Endpoints

Added automatically when you call `setupRequestTracker`:

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
  id:              "req-1712315445000-a1b2c3",
  timestamp:       1712315445000,
  method:          "POST",
  path:            "/api/users",
  fullUrl:         "http://localhost:3000/api/users",
  statusCode:      201,
  duration:        145,     // ms
  requestSize:     256,     // bytes
  responseSize:    1024,    // bytes
  networkUsage:    1280,    // bytes (request + response)
  userAgent:       "Mozilla/5.0...",
  ipAddress:       "127.0.0.1",
  queryParams:     {},
  requestHeaders:  { ... },
  responseHeaders: { ... }
}
```

---

## P95 Latency

P95 means "95 out of 100 requests complete within this time."

| Value | Label |
|---|---|
| ≤ 100 ms | Excellent — requests are very fast |
| ≤ 300 ms | Good — feels instant to users |
| ≤ 600 ms | Acceptable — most users won't notice |
| ≤ 1 000 ms | Slow — some users may notice a delay |
| > 1 000 ms | Poor — requests taking over 1 second |

---

## Security

The tracker auto-excludes its own routes from being tracked. For production, protect the dashboard with auth middleware before calling `setupRequestTracker`:

```js
app.use('/request-tracker', requireAdminAuth);
app.use('/admin/request-tracker', requireAdminAuth);
setupRequestTracker(app, { ... });
```

---

## License

MIT
