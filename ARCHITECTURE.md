# Request Tracker Pro - Project Overview

## 📂 Project Structure

```
request-tracker/
├── src/
│   ├── index.ts                    # Main entry point & exports
│   ├── types.ts                    # TypeScript type definitions
│   ├── tracker.ts                  # Core RequestTracker class
│   │
│   ├── middleware/
│   │   ├── express.ts              # Express middleware wrapper
│   │   └── index.ts                # Middleware exports
│   │
│   ├── storage/
│   │   ├── base.ts                 # Abstract StorageAdapter
│   │   ├── memory.ts               # RAM-based storage
│   │   ├── logging.ts              # Console/logging storage
│   │   └── index.ts                # Storage exports
│   │
│   ├── analytics/
│   │   ├── analyzer.ts             # RequestAnalyzer for stats
│   │   └── index.ts                # Analytics exports
│   │
│   └── utils/
│       ├── formatter.ts            # Format requests (size, time, etc)
│       ├── helpers.ts              # Utility functions
│       └── index.ts                # Utils exports
│
├── dashboard/                       # Next.js Admin Dashboard
│   ├── pages/
│   │   ├── index.tsx               # Main dashboard page
│   │   ├── layout.tsx              # Root layout
│   │   └── api/                    # API routes
│   ├── components/                  # React components
│   ├── public/                      # Static assets
│   ├── globals.css                 # Global styles
│   ├── package.json
│   ├── tsconfig.json
│   └── next.config.js
│
├── examples/
│   ├── express-basic.js            # Minimal setup example
│   ├── logging-only.js             # Logging-only mode example
│   └── advanced-config.js          # Full configuration example
│
├── tests/                           # Unit tests (Jest)
│   ├── tracker.test.ts
│   └── analytics.test.ts
│
├── package.json                    # NPM package config
├── tsconfig.json                   # TypeScript config
├── README.md                       # Main documentation
├── GUIDE.md                        # Getting started guide
├── CHANGELOG.md                    # Version history
├── CONTRIBUTING.md                # Contribution guidelines
├── LICENSE                         # MIT License
├── .gitignore
└── setup.sh                        # Quick setup script
```

---

## 🏗️ Architecture

### Request Flow

```
HTTP Request
    ↓
Express Middleware
    ↓
RequestTracker.middleware()
    ├─→ Capture: Headers, Body, Query, Timing
    ├─→ Calculate: Size, Duration, Network
    ├─→ Transform: Mask sensitive fields, anonymize IP
    ├─→ Batch: Add to in-memory batch
    ├─→ Trigger: onRequest callback
    └─→ Flush: Send to storage when batch full
        ├─→ Memory Storage (instant)
        ├─→ Logging Storage (console/file)
        └─→ File Storage (async write)
    ↓
Original Response Handler
    ↓
HTTP Response
```

### Data Flow for Analytics

```
Storage Adapter
    ↓
RequestAnalyzer.analyzeRequests()
    ├─→ Calculate Stats (avg, min, max, percentiles)
    ├─→ Group by Path/Method
    ├─→ Calculate Error Rates
    ├─→ Find Slowest Endpoints
    ├─→ Calculate Network Usage
    └─→ Generate Trends
    ↓
Dashboard / Admin Endpoints
    ├─→ Stats API
    ├─→ Dashboard API
    ├─→ Query API
    └─→ Export API (CSV/JSON)
    ↓
Admin UI / REST Clients
```

---

## 🔌 Core Classes

### `RequestTracker`
Main class that:
- Provides Express middleware
- Manages storage adapter
- Handles batch flushing
- Generates analytics
- Exposes admin endpoints

**Key Methods:**
- `middleware()` - Returns Express middleware function
- `getStats()` - Get aggregated statistics
- `query()` - Query tracked requests
- `getNetworkAnalytics()` - Network metrics
- `exportData()` - Export as CSV/JSON

### `StorageAdapter` (Abstract Base)
Interface all storage implementations must follow:
- `save()` - Save single request
- `get()` - Retrieve by ID
- `query()` - Query with filters
- `getAll()` - Get all requests
- `export()` - Export functionality

### `MemoryStorage`
In-memory implementation:
- Fast, no persistence
- Auto-cleanup on TTL
- Compression support
- Best for real-time analytics

### `LoggingOnlyStorage`
Logging implementation:
- No persistence (logs to console/file)
- Perfect for dev/testing
- Customizable format
- Works with Winston, Pino, console, etc.

### `RequestAnalyzer`
Static analytics class:
- `analyzeRequests()` - Generate stats
- `getTopEndpoints()` - Most popular endpoints
- `getSlowestEndpoints()` - Performance analysis
- `getLatencyTrends()` - Time-series data
- `detectAnomalies()` - Find outliers

### `RequestFormatter`
Utilities for formatting:
- `formatBytes()` - Human readable sizes
- `formatDuration()` - Time formatting
- `maskSensitiveData()` - Field masking
- `anonymizeIP()` - IP hashing
- `prettyPrintRequest()` - Console output

---

## 📊 Data Model

### TrackedRequest
```typescript
{
  id: string;                      // Unique ID
  timestamp: number;               // Request time
  method: string;                  // HTTP method
  path: string;                    // Request path
  fullUrl: string;                 // Complete URL
  statusCode: number;              // Response status
  duration: number;                // Time taken (ms)
  requestSize: number;             // Request bytes
  responseSize: number;            // Response bytes
  networkUsage: number;            // Total bytes
  headers?: Record<string, string> // Request headers
  queryParams?: Record<string, any>
  userId?: string;
  ipAddress?: string;
  error?: { message, stack }
}
```

### RequestStats
```typescript
{
  totalRequests: number;
  averageResponseTime: number;
  p50ResponseTime: number;  // Median
  p95ResponseTime: number;  // 95th percentile
  p99ResponseTime: number;  // 99th percentile
  statusDistribution: { [code]: count }
  errorRate: number;        // Percentage
  topEndpoints: EndpointStats[]
  slowestEndpoints: EndpointStats[]
  // ... more fields
}
```

---

## 🚀 Usage Pattern

```javascript
// 1. Import
const { setupRequestTracker } = require('request-tracker-pro');

// 2. Configure (optional)
const config = {
  trackHeaders: true,
  trackBody: false,
  storage: {
    primary: 'memory',
    memory: { maxSize: 10000, ttl: 3600000 }
  },
  onRequest: (data) => { /* custom handling */ }
};

// 3. Apply as middleware
setupRequestTracker(app, config);

// 4. Access data via admin endpoints
// GET /admin/request-tracker/stats
// GET /admin/request-tracker/dashboard
// GET /admin/request-tracker/export?format=csv
```

---

## 🔄 Batch Processing

```
Request 1 → Batch[1]
Request 2 → Batch[2]
...
Request 50 → Batch[50] → FLUSH to Storage
Request 51 → Batch[1] (new batch)
```

OR every 5 seconds, whichever comes first.

**Benefits:**
- Reduces I/O operations
- Improves performance
- Better for database writes
- Memory efficient

---

## 🔐 Security Features

1. **Sensitive Field Masking**
   - Automatically masks: password, token, apiKey, etc.
   - Result: "***MASKED***"

2. **IP Anonymization**
   - Hashes last octet: 192.168.1.100 → 192.168.1.***

3. **Path Exclusion**
   - Skip tracking: /health, /metrics, /login

4. **Body Size Limits**
   - Prevent logging huge payloads

5. **Field-level Filtering**
   - Only track needed fields

---

## 📈 Performance Optimizations

1. **Batch Processing**
   - Groups requests before flushing
   - Reduces storage operations

2. **Compression**
   - Optional gzip for file storage
   - Saves 70% space

3. **TTL Auto-cleanup**
   - Memory storage removes old entries automatically
   - Prevents unbounded memory growth

4. **Lazy Loading**
   - Analytics calculated only when requested
   - Not computed on every request

5. **Indexed Queries**
   - Prepare indexes for common queries
   - Fast filtering

---

## 🧪 Testing Strategy

**Unit Tests:**
- `tracker.test.ts` - Core tracker functionality
- `analyzer.test.ts` - Analytics calculations
- `storage.test.ts` - Storage operations
- `middleware.test.ts` - Express integration

**Test Coverage Target:** 80%+

---

## 📦 Dependencies

**No Runtime Dependencies!**  (Except Express peer dependency)

**Dev Dependencies:**
- TypeScript - Type safety
- Jest - Testing
- ESLint - Code quality
- Prettier - Code formatting

**Peer Dependencies:**
- Express (optional) - For middleware

---

## 🔄 Extension Points

Users can extend by:

1. **Custom Storage**
   ```javascript
   class CustomStorage extends StorageAdapter {
     async save(request) { /* custom logic */ }
     async query(options) { /* custom logic */ }
     // ...implement all methods
   }
   ```

2. **Custom Callbacks**
   ```javascript
   const tracker = new RequestTracker({
     onRequest: (data) => {
       // Custom processing
       sendToDataLake(data);
       updateMetrics(data);
     }
   });
   ```

3. **Custom Formatters**
   ```javascript
   RequestFormatter.maskSensitiveData = (req, fields) => {
     // Custom masking logic
   };
   ```

---

## 📊 Built-in Admin Routes

```
GET /admin/request-tracker/stats           Stats
GET /admin/request-tracker/dashboard       Dashboard data
GET /admin/request-tracker/recent          Recent requests
GET /admin/request-tracker/slowest         Slowest requests
GET /admin/request-tracker/errors          Error requests
GET /admin/request-tracker/network         Network analytics
GET /admin/request-tracker/export          Export data (CSV/JSON)
```

---

## 🎯 Use Cases

✅ API Performance Monitoring  
✅ SLA Tracking  
✅ User Activity Logging  
✅ Bandwidth Usage Analysis  
✅ Error Detection & Alerts  
✅ Development & Testing  
✅ Load Testing Analysis  
✅ Cost Optimization  
✅ Compliance & Audit Trails  
✅ Rate Limiting Integration  

---

## 🚀 Deployment Checklist

- [ ] Configure appropriate storage (RAM vs File vs DB)
- [ ] Set up retention policies (TTL, max size)
- [ ] Enable data masking for production
- [ ] Exclude sensitive paths
- [ ] Set up monitoring/alerts
- [ ] Configure log rotation
- [ ] Set up data export/backup
- [ ] Test with production-like load
- [ ] Monitor memory usage
- [ ] Set up dashboard access controls

---

**This architecture ensures Request Tracker Pro is:**
- ✅ Fast & efficient
- ✅ Flexible & extensible
- ✅ Secure by default
- ✅ Easy to use
- ✅ Production-ready
