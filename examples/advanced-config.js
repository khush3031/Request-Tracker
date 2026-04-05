/**
 * Example 3: Advanced Configuration
 * Using memory storage with custom callbacks and network tracking
 */

const express = require('express');
const { RequestTracker } = require('../dist/tracker');

const app = express();
app.use(express.json());

// Create tracker with advanced config
const tracker = new RequestTracker({
  trackHeaders: true,
  trackBody: false,
  trackQueryParams: true,
  trackUserInfo: true,
  anonymizeIP: true, // Mask IP addresses for privacy
  maskSensitiveFields: ['password', 'token', 'apiKey', 'credit_card'],
  excludedPaths: ['/health', '/metrics', '/static/*'],
  
  // Storage configuration
  storage: {
    primary: 'memory',
    memory: {
      maxSize: 10000,
      ttl: 3600000,
      enableCompression: true,
      onMaxReached: 'discard'
    }
  },
  
  // Batch configuration for better performance
  batchSize: 100,
  flushInterval: 5000,
  
  // Custom callbacks
  onRequest: (data) => {
    // Detect slow requests
    if (data.duration > 2000) {
      console.error(`🔴 SLOW: ${data.method} ${data.path} took ${data.duration}ms`);
    }
    
    // Track network usage
    if (data.networkUsage > 1000000) {
      console.warn(`⚠️  Large response: ${data.path} (~${(data.networkUsage / 1024).toFixed(2)}KB)`);
    }
    
    // Track errors
    if (data.statusCode >= 500) {
      console.error(`❌ SERVER ERROR: ${data.method} ${data.path} - ${data.statusCode}`);
    }
  },
  
  onError: (error, request) => {
    console.error(`Tracking error for ${request.path}:`, error);
  }
});

// Apply middleware
app.use(tracker.middleware());

// Routes
app.get('/api/data', (req, res) => {
  res.json({ data: 'sample', records: Array(100).fill({ id: 1, value: 'test' }) });
});

app.post('/api/login', (req, res) => {
  // Password will be masked in logs
  const { username, password } = req.body;
  res.json({ token: 'secret-token-123', username });
});

// Admin endpoints to access tracked data
app.get('/admin/stats', async (req, res) => {
  const stats = await tracker.getStats();
  res.json(stats);
});

app.get('/admin/dashboard', async (req, res) => {
  const data = await tracker.getDashboardData();
  res.json(data);
});

app.get('/admin/slowest', async (req, res) => {
  const slowRequests = await tracker.getSlowestRequests(10);
  res.json(slowRequests);
});

app.get('/admin/network-usage/:path', async (req, res) => {
  const path = `/${req.params.path}`;
  const analytics = await tracker.getNetworkAnalytics(path);
  res.json(analytics);
});

// Export data
app.get('/admin/export', async (req, res) => {
  const format = req.query.format || 'json';
  const data = await tracker.exportData(format);
  
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="requests.csv"');
  } else {
    res.setHeader('Content-Type', 'application/json');
  }
  
  res.send(data);
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Stats: http://localhost:${PORT}/admin/stats`);
  console.log(`Dashboard: http://localhost:${PORT}/admin/dashboard`);
  console.log(`Export CSV: http://localhost:${PORT}/admin/export?format=csv`);
});
