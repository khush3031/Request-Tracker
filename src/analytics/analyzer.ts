import { TrackedRequest, RequestStats, EndpointStats, NetworkAnalytics } from '../types.js';
import { calculatePercentile, groupBy, getTimeGroup } from '../utils/helpers.js';

/**
 * Analytics analyzer for request tracking data
 */
export class RequestAnalyzer {
  /**
   * Analyze multiple requests and generate statistics
   */
  static analyzeRequests(requests: TrackedRequest[]): RequestStats {
    if (requests.length === 0) {
      return this.getEmptyStats();
    }

    const durations = requests.map(r => r.duration);
    const statusCodes = requests.map(r => r.statusCode);
    const networkUsages = requests.map(r => r.networkUsage);

    const totalDuration = durations.reduce((a, b) => a + b, 0);
    const totalNetworkUsage = networkUsages.reduce((a, b) => a + b, 0);

    // Status distribution
    const statusDistribution: Record<number, number> = {};
    statusCodes.forEach(code => {
      statusDistribution[code] = (statusDistribution[code] || 0) + 1;
    });

    // Error rate calculation
    const errorRequests = requests.filter(r => r.statusCode >= 400);
    const errorRate = (errorRequests.length / requests.length) * 100;

    // Method distribution
    const methodDistribution: Record<string, number> = {};
    requests.forEach(r => {
      methodDistribution[r.method] = (methodDistribution[r.method] || 0) + 1;
    });

    // Top endpoints
    const topEndpoints = this.getTopEndpoints(requests, 10);
    const slowestEndpoints = this.getSlowestEndpoints(requests, 10);

    return {
      totalRequests: requests.length,
      totalDuration,
      averageResponseTime: totalDuration / requests.length,
      minResponseTime: Math.min(...durations),
      maxResponseTime: Math.max(...durations),
      p50ResponseTime: calculatePercentile(durations, 50),
      p95ResponseTime: calculatePercentile(durations, 95),
      p99ResponseTime: calculatePercentile(durations, 99),
      totalNetworkUsage,
      averageNetworkUsage: totalNetworkUsage / requests.length,
      statusDistribution,
      errorRate,
      successRate: 100 - errorRate,
      methodDistribution,
      topEndpoints,
      slowestEndpoints
    };
  }

  /**
   * Get top endpoints by request count
   */
  static getTopEndpoints(requests: TrackedRequest[], limit: number = 10): EndpointStats[] {
    const grouped = groupBy(requests, 'path');
    const endpoints: EndpointStats[] = [];

    for (const [path, reqs] of Object.entries(grouped)) {
      const durations = reqs.map(r => r.duration);
      const totalDuration = durations.reduce((a, b) => a + b, 0);
      const errorCount = reqs.filter(r => r.statusCode >= 400).length;

      // Get method from first request (could be mixed, but usually single method)
      const method = reqs[0].method;

      endpoints.push({
        path,
        method,
        count: reqs.length,
        averageResponseTime: totalDuration / reqs.length,
        p95ResponseTime: calculatePercentile(durations, 95),
        errorRate: (errorCount / reqs.length) * 100,
        totalNetworkUsage: reqs.reduce((sum, r) => sum + r.networkUsage, 0)
      });
    }

    // Sort by count
    return endpoints.sort((a, b) => b.count - a.count).slice(0, limit);
  }

  /**
   * Get slowest endpoints by average response time
   */
  static getSlowestEndpoints(requests: TrackedRequest[], limit: number = 10): EndpointStats[] {
    const grouped = groupBy(requests, 'path');
    const endpoints: EndpointStats[] = [];

    for (const [path, reqs] of Object.entries(grouped)) {
      if (reqs.length < 5) continue; // Skip endpoints with few requests

      const durations = reqs.map(r => r.duration);
      const totalDuration = durations.reduce((a, b) => a + b, 0);
      const errorCount = reqs.filter(r => r.statusCode >= 400).length;
      const method = reqs[0].method;

      endpoints.push({
        path,
        method,
        count: reqs.length,
        averageResponseTime: totalDuration / reqs.length,
        p95ResponseTime: calculatePercentile(durations, 95),
        errorRate: (errorCount / reqs.length) * 100,
        totalNetworkUsage: reqs.reduce((sum, r) => sum + r.networkUsage, 0)
      });
    }

    // Sort by average response time
    return endpoints.sort((a, b) => b.averageResponseTime - a.averageResponseTime).slice(0, limit);
  }

  /**
   * Get network analytics for specific path
   */
  static getNetworkAnalytics(requests: TrackedRequest[], path?: string): NetworkAnalytics {
    let filtered = requests;

    if (path) {
      filtered = requests.filter(r => r.path === path);
    }

    if (filtered.length === 0) {
      return {
        path: path || 'all',
        totalRequests: 0,
        totalNetworkUsage: 0,
        averageNetworkUsage: 0,
        requestDataUsage: 0,
        responseDataUsage: 0
      };
    }

    const totalNetworkUsage = filtered.reduce((sum, r) => sum + r.networkUsage, 0);
    const requestDataUsage = filtered.reduce((sum, r) => sum + r.requestSize, 0);
    const responseDataUsage = filtered.reduce((sum, r) => sum + r.responseSize, 0);

    return {
      path: path || 'all',
      totalRequests: filtered.length,
      totalNetworkUsage,
      averageNetworkUsage: totalNetworkUsage / filtered.length,
      requestDataUsage,
      responseDataUsage
    };
  }

  /**
   * Get latency trends over time (grouped by hour)
   */
  static getLatencyTrends(
    requests: TrackedRequest[],
    groupByPeriod: 'minute' | 'hour' | 'day' = 'hour'
  ): { timestamp: number; avgLatency: number; count: number }[] {
    const grouped: Record<number, number[]> = {};

    requests.forEach(r => {
      const key = getTimeGroup(r.timestamp, groupByPeriod);
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(r.duration);
    });

    return Object.entries(grouped)
      .map(([timestamp, durations]) => ({
        timestamp: parseInt(timestamp),
        avgLatency: durations.reduce((a, b) => a + b, 0) / durations.length,
        count: durations.length
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get error analysis
   */
  static getErrorAnalysis(requests: TrackedRequest[]): {
    statusCode: number;
    count: number;
    percentage: number;
  }[] {
    const errorRequests = requests.filter(r => r.statusCode >= 400);
    const statusDistribution: Record<number, number> = {};

    errorRequests.forEach(r => {
      statusDistribution[r.statusCode] = (statusDistribution[r.statusCode] || 0) + 1;
    });

    return Object.entries(statusDistribution)
      .map(([code, count]) => ({
        statusCode: parseInt(code),
        count,
        percentage: (count / requests.length) * 100
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get requests by time of day
   */
  static getRequestsByHour(requests: TrackedRequest[]): { hour: number; count: number }[] {
    const hourCounts: Record<number, number> = {};

    requests.forEach(r => {
      const hour = new Date(r.timestamp).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    return Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      count: hourCounts[i] || 0
    }));
  }

  /**
   * Detect anomalies (requests much slower than average)
   */
  static detectAnomalies(
    requests: TrackedRequest[],
    deviationThreshold: number = 2
  ): TrackedRequest[] {
    if (requests.length < 10) return [];

    const durations = requests.map(r => r.duration);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;

    // Calculate standard deviation
    const variance = durations.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / durations.length;
    const stdDev = Math.sqrt(variance);

    // Find anomalies (requests significantly slower)
    return requests.filter(r => r.duration > avg + stdDev * deviationThreshold);
  }

  /**
   * Get empty statistics object
   */
  private static getEmptyStats(): RequestStats {
    return {
      totalRequests: 0,
      totalDuration: 0,
      averageResponseTime: 0,
      minResponseTime: 0,
      maxResponseTime: 0,
      p50ResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      totalNetworkUsage: 0,
      averageNetworkUsage: 0,
      statusDistribution: {},
      errorRate: 0,
      successRate: 100,
      methodDistribution: {},
      topEndpoints: [],
      slowestEndpoints: []
    };
  }
}
