const express = require('express');
const { setupRequestTracker } = require('../dist/middleware/express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const tracker = setupRequestTracker(app, {
  trackHeaders: true,
  trackBody: false,
  trackQueryParams: true,
  excludedPaths: ['/health'],
  maskSensitiveFields: ['password', 'token', 'apiKey'],
  storage: { primary: 'file' }
});

// ─── Fake data ──────────────────────────────────────────────────────────────
const users = [
  { id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'admin' },
  { id: 2, name: 'Bob Smith',     email: 'bob@example.com',   role: 'user'  },
  { id: 3, name: 'Carol White',   email: 'carol@example.com', role: 'user'  },
];

const products = [
  { id: 1, name: 'Laptop Pro',    price: 1299, category: 'electronics', stock: 42 },
  { id: 2, name: 'Wireless Mouse',price: 29,   category: 'electronics', stock: 200 },
  { id: 3, name: 'Desk Chair',    price: 349,  category: 'furniture',   stock: 15 },
  { id: 4, name: 'Monitor 27"',   price: 599,  category: 'electronics', stock: 30 },
];

const orders = [
  { id: 101, userId: 1, productId: 1, quantity: 1, status: 'delivered', total: 1299 },
  { id: 102, userId: 2, productId: 2, quantity: 2, status: 'shipped',   total: 58   },
  { id: 103, userId: 3, productId: 3, quantity: 1, status: 'pending',   total: 349  },
];

// ─── Users ──────────────────────────────────────────────────────────────────
app.get('/api/users', (_req, res) => res.json({ users, total: users.length }));

app.get('/api/users/:id', (req, res) => {
  const user = users.find(u => u.id === Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

app.post('/api/users', (req, res) => {
  const user = { id: users.length + 1, ...req.body };
  users.push(user);
  res.status(201).json(user);
});

app.put('/api/users/:id', (req, res) => {
  const idx = users.findIndex(u => u.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  users[idx] = { ...users[idx], ...req.body };
  res.json(users[idx]);
});

app.delete('/api/users/:id', (req, res) => {
  const idx = users.findIndex(u => u.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  res.json({ message: `User ${req.params.id} deleted` });
});

// ─── Products ───────────────────────────────────────────────────────────────
app.get('/api/products', (_req, res) => res.json({ products, total: products.length }));

app.get('/api/products/:id', (req, res) => {
  const product = products.find(p => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

app.post('/api/products', (req, res) => {
  const product = { id: products.length + 1, ...req.body };
  products.push(product);
  res.status(201).json(product);
});

app.patch('/api/products/:id/stock', (req, res) => {
  const product = products.find(p => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found' });
  product.stock = req.body.stock ?? product.stock;
  res.json(product);
});

// ─── Orders ─────────────────────────────────────────────────────────────────
app.get('/api/orders', (_req, res) => res.json({ orders, total: orders.length }));

app.get('/api/orders/:id', (req, res) => {
  const order = orders.find(o => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

app.post('/api/orders', (req, res) => {
  const order = { id: 100 + orders.length + 1, status: 'pending', ...req.body };
  orders.push(order);
  res.status(201).json(order);
});

app.patch('/api/orders/:id/status', (req, res) => {
  const order = orders.find(o => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });
  order.status = req.body.status;
  res.json(order);
});

// ─── Auth (simulate slow + errors) ──────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = users.find(u => u.email === email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: 'fake-jwt-token-xyz', user });
});

app.post('/api/auth/logout', (_req, res) => res.json({ message: 'Logged out' }));

// ─── Search ──────────────────────────────────────────────────────────────────
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toString().toLowerCase();
  if (!q) return res.status(400).json({ error: 'Query param ?q= required' });
  const results = [
    ...users.filter(u => u.name.toLowerCase().includes(q)).map(u => ({ type: 'user', ...u })),
    ...products.filter(p => p.name.toLowerCase().includes(q)).map(p => ({ type: 'product', ...p })),
  ];
  res.json({ results, count: results.length });
});

// ─── Analytics (simulate slow endpoint) ─────────────────────────────────────
app.get('/api/analytics/summary', (_req, res) => {
  // Simulate a slightly slower DB query
  setTimeout(() => {
    res.json({
      totalUsers: users.length,
      totalProducts: products.length,
      totalOrders: orders.length,
      revenue: orders.reduce((s, o) => s + o.total, 0),
    });
  }, 120);
});

// ─── Error simulation routes ─────────────────────────────────────────────────
app.get('/api/error/500', (_req, res) => res.status(500).json({ error: 'Internal Server Error (simulated)' }));
app.get('/api/error/403', (_req, res) => res.status(403).json({ error: 'Forbidden (simulated)' }));
app.get('/api/error/404', (_req, res) => res.status(404).json({ error: 'Not Found (simulated)' }));

// ─── Health (excluded from tracking) ────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nExpress server: http://localhost:${PORT}`);
  console.log(`Dashboard:      http://localhost:${PORT}/request-tracker`);
  console.log(`\nSample API routes to test:`);
  console.log(`  GET  http://localhost:${PORT}/api/users`);
  console.log(`  GET  http://localhost:${PORT}/api/products`);
  console.log(`  GET  http://localhost:${PORT}/api/orders`);
  console.log(`  GET  http://localhost:${PORT}/api/analytics/summary`);
  console.log(`  GET  http://localhost:${PORT}/api/search?q=alice`);
  console.log(`  GET  http://localhost:${PORT}/api/error/500`);
});

process.on('SIGTERM', () => { tracker.destroy(); process.exit(0); });
