# 🚀 Request Tracker Pro

Advanced HTTP request tracking and analytics middleware for Node.js and Express. Track latency, network usage, response times, and detailed metrics with flexible storage options.

**Perfect for developers who want deep insights into their server's request handling without the complexity of external monitoring services.**

---

## 📊 Features

### Core Tracking
✅ **Request Timing** - Exact duration in milliseconds (high-resolution)  
✅ **Network Monitoring** - Track request/response sizes and total bandwidth usage  
✅ **Status Analysis** - Automatic categorization and error rate detection  
✅ **HTTP Methods** - Full method distribution and statistics  
✅ **Response Analytics** - Min, max, average, P50, P95, P99 response times  

### Data Security
✅ **Sensitive Field Masking** - Auto-mask passwords, tokens, API keys  
✅ **IP Anonymization** - Optional privacy-preserving IP hashing  
✅ **Custom Filtering** - Exclude health checks, metrics, static files  

### Flexible Storage  
✅ **In-Memory** - Fast, real-time analytics (no persistence)  
✅ **Logging-Only** - Server logs without database (perfect for dev/testing)  
✅ **File-Based** - Persistent, compressed, with rotation  
✅ **Database-Ready** - MongoDB/PostgreSQL support (extensible)  
✅ **Hybrid** - RAM + DB sync for performance + durability  

### Analytics & Insights
✅ **Automatic Anomaly Detection** - Find requests slower than baseline  
✅ **Network Usage Analytics** - Per-endpoint bandwidth tracking  
✅ **Latency Trends** - Track performance over time (minute/hour/day)  
✅ **Error Analysis** - Status code distribution and error patterns  
✅ **Top Endpoints** - Most-used and slowest endpoints  

### Easy Integration
✅ **Drop-in Middleware** - One line to start tracking  
✅ **Zero Dependencies** - Minimal core dependencies  
✅ **TypeScript** - Full type definitions included  
✅ **Node.js & Express** - Works with any Node.js framework  

---

## 🎯 Why Choose Request Tracker Pro?

### vs. Winston Logger
- Winston is general-purpose logging; **we're specialized for HTTP**
- Automatic request/response timing (no manual setup)
- Built-in performance metrics and analytics
- Structured data ready for dashboards

### vs. Morgan Logger
- Morgan logs basic request info; **we track detailed metrics**
- Network usage per request
- Response time percentiles (P95, P99)
- Flexible storage and retention

### vs. Datadog/New Relic
- No external service required
- Full control over your data
- No ongoing costs
- Works in development offline

---

## 📦 Installation

```bash
npm install request-tracker-pro
```

```bash
yarn add request-tracker-pro
```

```bash
pnpm add request-tracker-pro
```

---

## ⚡ Quick Start

### 1️⃣ Basic Setup (3 lines of code)

```javascript
const express = require('express');
const { setupRequestTracker } = require('request-tracker-pro');

const app = express();
app.use(express.json());

// One line - that's it!
setupRequestTracker(app);

app.get('/api/users', (req, res) => {
  res.json({ users: [] });
});

app.listen(3000, () => console.log('Tracking started!'));
```

Now visit:
- **Dashboard:** `http://localhost:3000/admin/request-tracker/dashboard`
- **Stats:** `http://localhost:3000/admin/request-tracker/stats`
- **Recent:** `http://localhost:3000/admin/request-tracker/recent?limit=50`

### 2️⃣ Logging-Only Mode (Development)

Just want to log requests to console without storage?

```javascript
const { RequestTracker } = require('request-tracker-pro');

const tracker = new RequestTracker({
  storage: {
    primary: 'logging-only',
    loggingOnly: {
      logger: console,
      format: 'text' // or 'json'
    }
  }
});

app.use(tracker.middleware());
```

**Output:**
```
[2026-04-05T10:30:45Z] GET /api/users - 200 (145ms) - Network: 2.45 KB
[2026-04-05T10:30:46Z] POST /api/users - 201 (234ms) - Network: 1.89 KB
[2026-04-05T10:30:47Z] GET /api/invalid - 404 (12ms) - Network: 0.34 KB
```

### 3️⃣ Advanced Configuration

```javascript
const { RequestTracker } = require('request-tracker-pro');

const tracker = new RequestTracker({
  // What to track
  trackHeaders: true,
  trackBody: false,
  trackQueryParams: true,
  trackUserInfo: true,
  
  // Security
  anonymizeIP: true,
  maskSensitiveFields: ['password', 'token', 'apiKey'],
  
  // Exclude paths
  excludedPaths: ['/health', '/metrics'],
  
  // Storage
  storage: {
    primary: 'memory',
    memory: {
      maxSize: 10000,
      ttl: 3600000, // 1 hour
      enableCompression: true
    }
  },
  
  // Callbacks
  onRequest: (data) => {
    if (data.duration > 2000) {
      console.warn(`Slow request: ${data.path} (${data.duration}ms)`);
    }
  }
});

app.use(tracker.middleware());
```

---

## 📈 What You Get Tracked

### Per Request:
```javascript
{
  id: "req-1712315445000-a1b2c3d4",      // Unique request ID
  timestamp: 1712315445000,                // When it happened
  method: "POST",                          // HTTP method
  path: "/api/users",                      // Request path
  fullUrl: "http://localhost:3000/api/users?page=1",
  
  // Timing (in milliseconds)
  duration: 145,                           // Total time
  startTime: 1712315445000,
  endTime: 1712315445145,
  
  // Network
  requestSize: 256,                        // Request size in bytes
  responseSize: 1024,                      // Response size in bytes
  networkUsage: 1280,                      // Total bytes
  
  // Response
  statusCode: 200,
  statusMessage: "OK",
  
  // User info (if tracked)
  userId: "user-123",
  sessionId: "sess-456",
  userAgent: "Mozilla/5.0...",
  ipAddress: "192.168.1.***",              // Anonymized if enabled
  
  // Errors (if any)
  error: {
    message: "Error message",
    stack: "...",
    code: "ERROR_CODE"
  }
}
```

### Dashboard Stats:
```javascript
{
  totalRequests: 1523,
  averageResponseTime: 145,
  minResponseTime: 5,
  maxResponseTime: 3420,
  
  // Percentiles
  p50ResponseTime: 120,  // median
  p95ResponseTime: 580,  // 95% of requests faster
  p99ResponseTime: 1200, // 99% of requests faster
  
  // Network
  totalNetworkUsage: 5242880,      // bytes
  averageNetworkUsage: 3441,       // per request
  
  // Errors
  errorRate: 2.3,                  // percentage
  successRate: 97.7,
  
  // Distribution
  statusDistribution: {
    200: 1480,
    201: 30,
    400: 5,
    500: 8
  },
  
  methodDistribution: {
    GET: 900,
    POST: 500,
    PUT: 100,
    DELETE: 23
  },
  
  topEndpoints: [
    {
      path: "/api/users",
      method: "GET",
      count: 450,
      averageResponseTime: 120,
      p95ResponseTime: 400,
      errorRate: 0.5,
      totalNetworkUsage: 1048576
    }
  ],
  
  slowestEndpoints: [
    {
      path: "/api/reports",
      method: "POST",
      averageResponseTime: 2500,
      // ... more fields
    }
  ]
}
```

---

## 🔧 Configuration Options

### `TrackerConfig`

```typescript
{
  // Tracking Features
  trackHeaders: boolean;              // Track request/response headers
  trackBody: boolean;                 // Track request/response body
  trackQueryParams: boolean;          // Track URL parameters
  trackUserInfo: boolean;             // Track user/session IDs
  
  // Security
  maskSensitiveFields: string[];      // Fields to mask in logs
  anonymizeIP: boolean;               // Hash IP addresses
  
  // Exclusions
  excludedPaths: string[];            // Exact path matches to skip
  excludedPathPatterns: RegExp[];     // Regex patterns to skip
  
  // Size Limits
  maxBodySize: number;                // Max body size to log (bytes)
  maxHeaderSize: number;              // Max header size (bytes)
  
  // Storage Configuration
  storage: StorageConfig;             // See storage options below
  
  // Batch Processing (for performance)
  batchSize: number;                  // Flush after N requests
  flushInterval: number;              // Or after X milliseconds
  
  // Callbacks
  onRequest: (data: TrackedRequest) => void;
  onError: (error: Error, request: TrackedRequest) => void;
}
```

### Storage Options

#### Memory Storage (Fast, In-RAM)
```javascript
{
  primary: 'memory',
  memory: {
    maxSize: 5000,              // Max requests to keep
    ttl: 3600000,               // Auto-delete after 1 hour
    enableCompression: true,    // Compress old data
    onMaxReached: 'discard'     // 'discard' | 'compress' | 'archive'
  }
}
```

#### Logging-Only Storage (Console/File)
```javascript
{
  primary: 'logging-only',
  loggingOnly: {
    logger: console,            // Your logger (Winston, Pino, etc.)
    format: 'text',             // 'text' | 'json' | 'custom'
    level: 'info',              // Log level
    customFormatter: (data) => {
      // Custom format function
      return `[${data.method}] ${data.path} - ${data.duration}ms`;
    }
  }
}
```

#### File Storage (Persistent, Compressed)
```javascript
{
  primary: 'file',
  file: {
    path: './logs/requests',
    maxFileSize: 52428800,      // 50MB per file
    maxBackups: 10,             // Keep 10 files
    compression: 'gzip',        // 'gzip' | 'none'
    rotationPolicy: 'daily'     // 'daily' | 'size' | etc.
  }
}
```

---

## 💻 API Reference

### Middleware
```javascript
app.use(tracker.middleware());
```

### Statistics
```javascript
const stats = await tracker.getStats();
// Returns: RequestStats with all aggregated metrics
```

### Dashboard Data
```javascript
const data = await tracker.getDashboardData();
// Returns: { stats, recentRequests, slowestRequests, errors, trends }
```

### Query Requests
```javascript
const requests = await tracker.query({
  method: 'POST',
  path: '/api/users',
  startTime: Date.now() - 86400000,  // Last 24 hours
  errorOnly: false,
  limit: 100
});
```

### Get Top Endpoints
```javascript
const endpoints = await tracker.getTopEndpoints(10);
// Returns: EndpointStats[] sorted by request count
```

### Network Analytics
```javascript
const analytics = await tracker.getNetworkAnalytics('/api/users');
// Returns: {
//   path: '/api/users',
//   totalRequests: 450,
//   totalNetworkUsage: 1048576,
//   averageNetworkUsage: 2329,
//   requestDataUsage: 524288,
//   responseDataUsage: 524288
// }
```

### Export Data
```javascript
const csvData = await tracker.exportData('csv');
const jsonData = await tracker.exportData('json');
```

### Clear Data
```javascript
await tracker.clearAll();
await tracker.clearOldRecords({ olderThan: '7-days' });
```

---

## 🎨 Built-in Admin Endpoints

Once configured, these endpoints are automatically available:

```
GET  /admin/request-tracker/stats          - Statistics
GET  /admin/request-tracker/dashboard      - Dashboard data
GET  /admin/request-tracker/recent         - Recent requests
GET  /admin/request-tracker/slowest        - Slowest requests
GET  /admin/request-tracker/errors         - Error requests
GET  /admin/request-tracker/network        - Network analytics
GET  /admin/request-tracker/export         - Export data
```

### Usage:
```bash
# Get stats
curl http://localhost:3000/admin/request-tracker/stats

# Get recent 50 requests
curl http://localhost:3000/admin/request-tracker/recent?limit=50

# Get slowest 10 requests
curl http://localhost:3000/admin/request-tracker/slowest?limit=10

# Get network usage for specific path
curl "http://localhost:3000/admin/request-tracker/network?path=/api/users"

# Export as CSV
curl http://localhost:3000/admin/request-tracker/export?format=csv > requests.csv

# Export as JSON
curl http://localhost:3000/admin/request-tracker/export?format=json > requests.json
```

---

## 🚀 Real-World Examples

### Example 1: Performance Monitoring

```javascript
const tracker = new RequestTracker({
  onRequest: (data) => {
    // Alert on slow requests
    if (data.duration > 2000) {
      console.error(`🔴 SLOW: ${data.method} ${data.path} (${data.duration}ms)`);
      sendAlert(`Slow request detected: ${data.path}`);
    }
    
    // Track bandwidth usage
    if (data.networkUsage > 1000000) {
      console.warn(`⚠️  Large response: ${data.path} - ${(data.networkUsage/1024).toFixed(2)}KB`);
    }
  }
});
```

### Example 2: Development Logging

```javascript
const tracker = new RequestTracker({
  storage: {
    primary: 'logging-only',
    loggingOnly: {
      logger: console,
      format: 'json'
    }
  },
  onRequest: (data) => {
    if (data.error) {
      console.error('Request error:', data.error);
    }
  }
});
```

### Example 3: User Activity Tracking

```javascript
const tracker = new RequestTracker({
  trackUserInfo: true,
  onRequest: (data) => {
    // Log user activities
    if (data.userId) {
      logUserActivity({
        userId: data.userId,
        action: data.method,
        resource: data.path,
        timestamp: data.timestamp,
        duration: data.duration
      });
    }
  }
});
```

### Example 4: API Rate Limiting

```javascript
const tracker = new RequestTracker({
  onRequest: (data) => {
    const userId = data.userId;
    requestCounts[userId] = (requestCounts[userId] || 0) + 1;
    
    if (requestCounts[userId] > 1000) {
      console.warn(`Rate limit approaching for user: ${userId}`);
    }
  }
});
```

---

## 📊 Understanding the Metrics

### Response Time Percentiles
- **P50 (Median)**: 50% of requests are faster than this
- **P95**: 95% of requests are faster than this (slow 5%)
- **P99**: 99% of requests are faster than this (slow 1%)

Example: If P95 = 500ms, then 95% of your requests complete in 500ms or less.

### Network Usage
- **Request Size**: Headers + body size of incoming request
- **Response Size**: Headers + body size of outgoing response
- **Total Network Usage**: Request size + Response size

### Error Rate
Percentage of requests with status code >= 400

---

## 🔐 Security Best Practices

1. **Mask Sensitive Fields**
```javascript
maskSensitiveFields: ['password', 'token', 'apiKey', 'creditCard', 'ssn']
```

2. **Anonymize IPs**
```javascript
anonymizeIP: true  // Converts 192.168.1.100 → 192.168.1.***
```

3. **Exclude Sensitive Paths**
```javascript
excludedPaths: ['/login', '/auth/token', '/payment']
```

4. **Limit Body Size**
```javascript
maxBodySize: 1000  // Only log first 1KB of body
```

---

## 🐛 Troubleshooting

### "No data showing up"
- Check that tracker is registered before routes
- Verify storage configuration
- Check console for errors

### "Memory usage growing"
- Reduce `memory.maxSize` or `memory.ttl`
- Use `logging-only` for development
- Enable compression with `enableCompression: true`

### "Slow request tracking is impacting performance"
- Increase `batchSize` to batch more requests
- Increase `flushInterval` to flush less frequently
- Use `trackBody: false` if not needed

---

## 📝 License

MIT

---

## 🤝 Contributing

Contributions are welcome! Please see CONTRIBUTING.md

---

## Support

- 📖 [Full Documentation](https://github.com/yourusername/request-tracker-pro)
- 🐛 [Report Issues](https://github.com/yourusername/request-tracker-pro/issues)
- 💬 [Discussions](https://github.com/yourusername/request-tracker-pro/discussions)

---

**Happy tracking! 🎉**
