'use client';

import { useEffect, useState, useRef } from 'react';
import axios from 'axios';

interface RequestEntry {
  id: string;
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  networkUsage: number;
}

interface DashboardData {
  stats: {
    totalRequests: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    errorRate: number;
    averageNetworkUsage: number;
    totalNetworkUsage: number;
    statusDistribution: Record<string, number>;
  };
  recentRequests: RequestEntry[];
  slowestRequests: RequestEntry[];
}

const TIME_RANGES = [
  { label: '5 min', ms: 5 * 60 * 1000 },
  { label: '10 min', ms: 10 * 60 * 1000 },
  { label: '15 min', ms: 15 * 60 * 1000 },
  { label: '20 min', ms: 20 * 60 * 1000 },
  { label: '30 min', ms: 30 * 60 * 1000 },
  { label: '45 min', ms: 45 * 60 * 1000 },
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '2 hours', ms: 2 * 60 * 60 * 1000 },
  { label: '6 hours', ms: 6 * 60 * 60 * 1000 },
  { label: 'All', ms: Infinity },
];

function p95Label(ms: number): string {
  if (ms <= 100) return 'Excellent — 95% of requests are very fast';
  if (ms <= 300) return 'Good — 95% of requests feel instant to users';
  if (ms <= 600) return 'Acceptable — most users won\'t notice';
  if (ms <= 1000) return 'Slow — some users may notice a delay';
  return 'Poor — 95% of requests are taking over 1 second';
}

function p95Color(ms: number): string {
  if (ms <= 300) return 'text-emerald-300';
  if (ms <= 600) return 'text-yellow-300';
  return 'text-rose-400';
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [rangeMs, setRangeMs] = useState(Infinity);
  const [lastAccessed, setLastAccessed] = useState<string | null>(null);
  const lastAccessedRef = useRef<string | null>(null);

  useEffect(() => {
    // Restore last accessed time from localStorage
    const stored = localStorage.getItem('rt_last_accessed');
    if (stored) lastAccessedRef.current = stored;

    const fetchData = async () => {
      try {
        const response = await axios.get('http://localhost:3000/admin/request-tracker/data');
        setData(response.data);
        setError(false);

        // Save & display last accessed
        const now = new Date().toLocaleString();
        const prev = lastAccessedRef.current;
        lastAccessedRef.current = now;
        localStorage.setItem('rt_last_accessed', now);
        setLastAccessed(prev);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 px-8 py-10 text-center shadow-xl">
          <p className="text-lg font-medium text-slate-100">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (error || !data || !data.stats) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="rounded-3xl border border-rose-600/40 bg-rose-500/10 px-8 py-10 text-center shadow-xl">
          <p className="text-lg font-medium text-rose-200">
            Failed to load dashboard. Make sure your server is running with Request Tracker.
          </p>
          <p className="mt-2 text-sm text-rose-400">Expected: <code>http://localhost:3000/admin/request-tracker/data</code></p>
        </div>
      </div>
    );
  }

  const { stats, recentRequests, slowestRequests } = data;

  // Filter requests by selected time range
  const cutoff = rangeMs === Infinity ? 0 : Date.now() - rangeMs;
  const filteredRecent = recentRequests.filter(r => r.timestamp >= cutoff);
  const filteredSlowest = slowestRequests.filter(r => r.timestamp >= cutoff);

  // Recompute stats for range
  const rangeStats = rangeMs === Infinity ? stats : (() => {
    const reqs = filteredRecent;
    const total = reqs.length;
    const avgDuration = total ? reqs.reduce((s, r) => s + r.duration, 0) / total : 0;
    const sorted = [...reqs].sort((a, b) => a.duration - b.duration);
    const p95 = sorted[Math.floor(sorted.length * 0.95)]?.duration ?? 0;
    const errors = reqs.filter(r => r.statusCode >= 400).length;
    const totalNet = reqs.reduce((s, r) => s + r.networkUsage, 0);
    return {
      totalRequests: total,
      averageResponseTime: avgDuration,
      p95ResponseTime: p95,
      errorRate: total ? (errors / total) * 100 : 0,
      averageNetworkUsage: total ? totalNet / total : 0,
      totalNetworkUsage: totalNet,
      statusDistribution: stats.statusDistribution,
    };
  })();

  const p95ms = Math.round(rangeStats.p95ResponseTime);

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-xl backdrop-blur-lg">

          {/* Header */}
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-slate-50">📊 Request Tracker</h1>
              <p className="mt-1 text-slate-400 text-sm">Real-time HTTP Request Analytics — auto-refreshes every 10s</p>
              {lastAccessed && (
                <p className="mt-1 text-xs text-slate-500">
                  🕓 Last accessed: <span className="text-slate-400">{lastAccessed}</span>
                </p>
              )}
            </div>
            <div className="text-xs text-slate-500 text-right">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse mr-1"></span>
              Live
            </div>
          </div>

          {/* Time range selector */}
          <div className="mb-8">
            <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Showing data for</p>
            <div className="flex flex-wrap gap-2">
              {TIME_RANGES.map(r => (
                <button
                  key={r.label}
                  onClick={() => setRangeMs(r.ms)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    rangeMs === r.ms
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-indigo-500'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">

            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
              <div className="text-xs uppercase tracking-widest text-slate-400">Total Requests</div>
              <div className="mt-3 text-3xl font-semibold">{rangeStats.totalRequests.toLocaleString()}</div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
              <div className="text-xs uppercase tracking-widest text-slate-400">Avg Response</div>
              <div className="mt-3 text-3xl font-semibold">{Math.round(rangeStats.averageResponseTime)}ms</div>
              <div className="mt-1 text-xs text-slate-500">average time per request</div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 col-span-1 md:col-span-2 xl:col-span-2">
              <div className="text-xs uppercase tracking-widest text-slate-400">P95 Latency</div>
              <div className={`mt-3 text-3xl font-semibold ${p95Color(p95ms)}`}>{p95ms}ms</div>
              <div className="mt-1 text-xs text-slate-400 leading-relaxed">{p95Label(p95ms)}</div>
              <div className="mt-1 text-xs text-slate-600">95 out of 100 requests finish within this time</div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
              <div className="text-xs uppercase tracking-widest text-slate-400">Error Rate</div>
              <div className={`mt-3 text-3xl font-semibold ${rangeStats.errorRate > 5 ? 'text-rose-400' : 'text-emerald-300'}`}>
                {rangeStats.errorRate.toFixed(1)}%
              </div>
              <div className="mt-1 text-xs text-slate-500">4xx + 5xx responses</div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
              <div className="text-xs uppercase tracking-widest text-slate-400">Total Bandwidth</div>
              <div className="mt-3 text-3xl font-semibold">
                {(rangeStats.totalNetworkUsage / (1024 * 1024)).toFixed(2)} MB
              </div>
              <div className="mt-1 text-xs text-slate-500">
                avg {(rangeStats.averageNetworkUsage / 1024).toFixed(1)} KB/req
              </div>
            </div>

          </div>

          <div className="mt-10 space-y-10">

            {/* Recent Requests */}
            <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-semibold text-slate-100">🕐 Recent Requests</h2>
                <span className="text-xs text-slate-500">{filteredRecent.length} in selected range</span>
              </div>
              {filteredRecent.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-8">No requests in this time range</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-800">
                  <table className="min-w-full divide-y divide-slate-800 text-left text-sm text-slate-300">
                    <thead className="bg-slate-900 text-slate-400">
                      <tr>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider">Time</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider">Method</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider">Path</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider">Duration</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider">Network</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-950">
                      {filteredRecent.slice(0, 10).map((req) => (
                        <tr key={req.id} className="hover:bg-slate-900/80">
                          <td className="px-4 py-3 text-slate-400">{new Date(req.timestamp).toLocaleTimeString()}</td>
                          <td className="px-4 py-3 font-mono font-bold text-slate-100">{req.method}</td>
                          <td className="px-4 py-3 font-mono text-xs truncate max-w-[240px]">{req.path}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              req.statusCode < 400 ? 'bg-emerald-500/15 text-emerald-300' :
                              req.statusCode < 500 ? 'bg-yellow-500/15 text-yellow-300' :
                              'bg-rose-500/15 text-rose-300'
                            }`}>{req.statusCode}</span>
                          </td>
                          <td className={`px-4 py-3 font-medium ${req.duration > 500 ? 'text-rose-400' : 'text-slate-200'}`}>
                            {req.duration.toFixed(0)}ms
                          </td>
                          <td className="px-4 py-3 text-slate-400">{(req.networkUsage / 1024).toFixed(2)} KB</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Slowest Requests */}
            <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-semibold text-slate-100">🐢 Slowest Requests</h2>
                <span className="text-xs text-slate-500">top slow in selected range</span>
              </div>
              {filteredSlowest.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-8">No data in this time range</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-800">
                  <table className="min-w-full divide-y divide-slate-800 text-left text-sm text-slate-300">
                    <thead className="bg-slate-900 text-slate-400">
                      <tr>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider">Method</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider">Path</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider">Duration</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-950">
                      {filteredSlowest.slice(0, 10).map((req) => (
                        <tr key={req.id} className="hover:bg-slate-900/80">
                          <td className="px-4 py-3 font-mono font-bold text-slate-100">{req.method}</td>
                          <td className="px-4 py-3 font-mono text-xs truncate max-w-[280px]">{req.path}</td>
                          <td className={`px-4 py-3 font-semibold ${req.duration > 1000 ? 'text-rose-400' : req.duration > 300 ? 'text-yellow-300' : 'text-emerald-300'}`}>
                            {req.duration.toFixed(0)}ms
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              req.statusCode < 400 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
                            }`}>{req.statusCode}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Status Distribution */}
            <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6">
              <h2 className="mb-5 text-xl font-semibold text-slate-100">Status Code Breakdown</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(stats.statusDistribution).map(([code, count]: [string, any]) => (
                  <div key={code} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                    <div className="text-xs uppercase tracking-widest text-slate-500">Status {code}</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-100">{count.toLocaleString()}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {Number(code) < 400 ? '✓ Success' : Number(code) < 500 ? '⚠ Client error' : '✗ Server error'}
                    </div>
                  </div>
                ))}
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
