/**
 * Test: Route-Specific Storage Middleware
 *
 * Demonstrates how different endpoints are routed to different storage adapters.
 *
 * Storage routing in this example:
 *   POST /api/auth/**     → file  (./logs/auth-audit.json)  + body always captured
 *   GET  /api/orders/**   → logging-only (console output)
 *   /api/payments         → file  (./logs/payments.json)    + body captured, POST/PUT only
 *   Everything else       → memory (global default)
 *
 * Run:
 *   node examples/route-specific-storage.js
 *
 * Then hit the routes below and watch what happens:
 *   POST http://localhost:3001/api/auth/login        → written to ./logs/auth-audit.json
 *   GET  http://localhost:3001/api/orders            → printed to console only
 *   POST http://localhost:3001/api/payments          → written to ./logs/payments.json
 *   GET  http://localhost:3001/api/users             → stored in memory (default)
 *   GET  http://localhost:3001/request-tracker       → dashboard (shows only memory requests)
 */

const express = require('express');
const { setupRequestTracker } = require('../dist/middleware/express');
const cors  = require('cors');
const fs    = require('fs');
const path  = require('path');

// Ensure log directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

const app = express();
app.use(express.json());
app.use(cors());

// ─── Setup tracker with route-specific storage ───────────────────────────────

const tracker = setupRequestTracker(app, {
  trackHeaders:       true,
  trackBody:          false,         // global default: body OFF
  trackQueryParams:   true,
  excludedPaths:      ['/health'],
  maskSensitiveFields: ['password', 'token', 'secret', 'apiKey'],

  // onRequest fires for EVERY request regardless of which adapter handles it.
  // Use this to see routing decisions in real time.
  onRequest: (data) => {
    const ruled =
      (data.path.startsWith('/api/auth'))     ? '→ [Rule 1] file: auth-audit.json' :
      (data.path.startsWith('/api/orders'))   ? '→ [Rule 2] logging-only (console)' :
      (data.path === '/api/payments' && ['POST','PUT'].includes(data.method))
                                              ? '→ [Rule 3] file: payments.json' :
                                                '→ [Default] memory';
    console.log(`[TRACKER] ${data.method} ${data.path} ${data.statusCode} ${ruled}`);
  },

  // Global default storage (all unmatched routes go here)
  storage: {
    adapters: [{ type: 'memory', maxSize: 500 }]
  },

  // ── Route-specific rules ──────────────────────────────────────────────────
  routes: [
    // Rule 1 — Auth routes: capture body, write to dedicated audit file
    {
      path:      '/api/auth/**',
      trackBody: true,                // override: capture body for auth calls
      storage:   { type: 'file', path: path.join(logsDir, 'auth-audit.json') }
    },

    // Rule 2 — Orders: log to console only (no DB/file write)
    // '/api/orders*' matches both /api/orders and /api/orders/123 (use * not /**)
    {
      path:    '/api/orders*',
      storage: { type: 'logging-only', format: 'text' }
    },

    // Rule 3 — Payments: POST/PUT only, body captured, written to payments file
    {
      path:      '/api/payments',
      methods:   ['POST', 'PUT'],
      trackBody: true,
      storage:   { type: 'file', path: path.join(logsDir, 'payments.json') }
    },
  ]
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Auth (hits Rule 1 → auth-audit.json)
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  res.json({ token: 'fake-token-abc', email });
});
app.post('/api/auth/logout', (_req, res) => res.json({ message: 'Logged out' }));

// Orders (hits Rule 2 → logging-only / console)
app.get('/api/orders',     (_req, res) => res.json({ orders: [{ id: 101, status: 'delivered' }] }));
app.get('/api/orders/:id', (req, res)  => res.json({ id: Number(req.params.id), status: 'pending' }));
app.post('/api/orders',    (req, res)  => res.status(201).json({ id: 999, ...req.body }));

// Payments POST/PUT (hits Rule 3 → payments.json)
// Payments GET (no matching rule → falls through to memory / global default)
app.get('/api/payments',      (_req, res) => res.json({ payments: [{ id: 1, amount: 500 }] }));
app.post('/api/payments',     (req, res)  => res.status(201).json({ id: 200, ...req.body, status: 'pending' }));
app.put('/api/payments/:id',  (req, res)  => res.json({ id: Number(req.params.id), ...req.body }));

// Users — no rule → memory (global default)
app.get('/api/users',     (_req, res) => res.json({ users: [{ id: 1, name: 'Alice' }] }));
app.get('/api/users/:id', (req, res)  => res.json({ id: Number(req.params.id), name: 'Alice' }));
app.post('/api/users',    (req, res)  => res.status(201).json({ id: 99, ...req.body }));

// Error simulation
app.get('/api/error/500', (_req, res) => res.status(500).json({ error: 'Simulated 500' }));
app.get('/api/error/404', (_req, res) => res.status(404).json({ error: 'Simulated 404' }));

// Health (excluded from tracking entirely)
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('\n=== Route-Specific Storage Test Server ===\n');
  console.log(`Server:    http://localhost:${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/request-tracker`);
  console.log(`           (shows memory-stored requests only)\n`);

  console.log('Storage routing:');
  console.log('  /api/auth/**        → file  → examples/logs/auth-audit.json  (body captured)');
  console.log('  /api/orders*        → logging-only → printed to THIS terminal');
  console.log('  POST|PUT /api/payments → file → examples/logs/payments.json  (body captured)');
  console.log('  GET /api/payments   → memory (POST/PUT rule does not match GET)');
  console.log('  /api/users          → memory (no rule, global default)\n');

  console.log('Try these curl commands:\n');
  console.log(`  # Auth → check examples/logs/auth-audit.json`);
  console.log(`  curl -s -X POST http://localhost:${PORT}/api/auth/login \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"email":"alice@example.com","password":"secret123"}'\n`);

  console.log(`  # Orders → watch console output below`);
  console.log(`  curl -s http://localhost:${PORT}/api/orders\n`);

  console.log(`  # Payments POST → check examples/logs/payments.json`);
  console.log(`  curl -s -X POST http://localhost:${PORT}/api/payments \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"amount":150,"currency":"USD"}'\n`);

  console.log(`  # Users → check dashboard (stored in memory)`);
  console.log(`  curl -s http://localhost:${PORT}/api/users\n`);

  console.log('━'.repeat(50));
});

process.on('SIGTERM', () => { tracker.destroy(); process.exit(0); });
