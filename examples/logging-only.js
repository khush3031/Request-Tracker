/**
 * Example 2: Logging-Only Mode
 * Track requests and log them without storing to database
 * Perfect for development and testing
 */

const express = require('express');
const { RequestTracker } = require('../dist/tracker');

const app = express();
app.use(express.json());

// Create tracker with logging-only storage
const tracker = new RequestTracker({
  trackHeaders: true,
  trackBody: true, // Log request/response body
  trackQueryParams: true,
  storage: {
    primary: 'logging-only',
    loggingOnly: {
      logger: console,
      format: 'text', // 'text' | 'json' | 'custom'
      level: 'info'
    }
  },
  // Custom callback for additional processing
  onRequest: (data) => {
    if (data.duration > 1000) {
      console.warn(`⚠️  Slow request detected: ${data.path} (${data.duration}ms)`);
    }
  }
});

// Apply middleware
app.use(tracker.middleware());

// Example routes
app.get('/api/slow-endpoint', (req, res) => {
  setTimeout(() => {
    res.json({ message: 'This will be logged with timing' });
  }, 1500);
});

app.post('/api/data', (req, res) => {
  res.json({ received: req.body, size: JSON.stringify(req.body).length });
});

// Error example
app.get('/api/error', (req, res) => {
  res.status(500).json({ error: 'Something went wrong' });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('All requests are logged to console (no database storage)');
});
