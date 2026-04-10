/**
 * Type definitions for Request Tracker Pro
 */

export enum StorageType {
  MEMORY = 'memory',
  FILE = 'file',
  LOGGING = 'logging-only',
  MONGODB = 'mongodb',
  POSTGRESQL = 'postgresql'
}

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

/**
 * Main request data structure captured by the tracker
 */
export interface TrackedRequest {
  id: string;
  timestamp: number;
  method: string; // GET, POST, PUT, DELETE, etc.
  path: string;
  fullUrl: string;
  statusCode: number;
  statusMessage: string;
  
  // Timing metrics (in milliseconds)
  startTime: number;
  endTime: number;
  duration: number; // endTime - startTime
  
  // Network metrics
  requestSize: number; // bytes
  responseSize: number; // bytes
  networkUsage: number; // total bytes (request + response)
  
  // Headers (optional)
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  
  // Query parameters
  queryParams?: Record<string, any>;
  
  // Body data (optional, based on config)
  requestBody?: string | Record<string, any>;
  responseBody?: string | Record<string, any>;
  
  // User/Session info
  userId?: string;
  sessionId?: string;
  
  // Client info
  userAgent?: string;
  ipAddress?: string;
  
  // Error info
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  
  // Custom fields
  custom?: Record<string, any>;
}

/**
 * Route-specific tracking rule.
 * Matched requests are saved to `storage` instead of the global storage.
 * Rules are evaluated in order — the first match wins.
 *
 * @example
 * routes: [
 *   {
 *     path: '/api/payments',
 *     methods: ['POST', 'PUT'],
 *     storage: { type: 'mongodb', uri: 'mongodb://...' }
 *   },
 *   {
 *     path: '/api/auth/**',   // glob wildcard
 *     storage: { type: 'file', path: './logs/auth-audit.json' }
 *   },
 *   {
 *     path: /^\/api\/admin/, // RegExp also accepted
 *     storage: [
 *       { type: 'postgresql', uri: 'postgresql://...' },
 *       { type: 'logging-only' }
 *     ]
 *   }
 * ]
 */
export interface RouteRule {
  /**
   * Exact path, glob pattern, or RegExp to match against `req.path`.
   *
   * Glob rules:
   *   `*`  — matches a single path segment  (e.g. `/api/users/*` matches `/api/users/1`)
   *   `**` — matches any depth              (e.g. `/api/users/**` matches `/api/users/1/profile`)
   *
   * Note: `/api/orders/**` does NOT match `/api/orders` (no trailing segment).
   * Use `/api/orders*` to match both `/api/orders` and `/api/orders/123`.
   */
  path: string | RegExp;
  /** HTTP methods to match (case-insensitive). Omit to match all methods. */
  methods?: string[];
  /** One adapter or an array of adapters (fan-out) to save matched requests to. */
  storage: StorageAdapterConfig | StorageAdapterConfig[];
  // Per-rule overrides — fall back to global config when not set
  trackBody?: boolean;
  trackHeaders?: boolean;
  maskSensitiveFields?: string[];
}

/**
 * Configuration for the tracker
 */
export interface TrackerConfig {
  // Tracking options
  trackHeaders: boolean;
  trackBody: boolean;
  trackQueryParams: boolean;
  trackUserInfo: boolean;

  // Paths to exclude from tracking
  excludedPaths: string[];
  excludedPathPatterns: RegExp[];

  // Body size limits
  maxBodySize: number; // bytes
  maxHeaderSize: number; // bytes

  // Sensitive fields to mask
  maskSensitiveFields: string[];

  // IP anonymization
  anonymizeIP: boolean;

  // Storage configuration (default — used when no route rule matches)
  storage: StorageConfig;

  /**
   * Per-endpoint routing rules.
   * Each matched request is saved to the rule's storage instead of the global storage.
   * Rules are evaluated in order; the first match wins.
   */
  routes?: RouteRule[];

  // Callbacks
  onRequest?: (data: TrackedRequest) => void;
  onError?: (error: Error, request: TrackedRequest) => void;

  // Batch processing
  batchSize: number;
  flushInterval: number; // milliseconds
}

/**
 * Per-adapter config for the multi-storage `adapters` array.
 * Each entry has a `type` discriminant plus its own options inline.
 */
export interface MemoryAdapterConfig {
  type: 'memory';
  /** Max number of requests to keep in RAM. Default: 5000 */
  maxSize?: number;
  /** Time-to-live in ms. Default: 3 600 000 (1 h) */
  ttl?: number;
  enableCompression?: boolean;
  onMaxReached?: 'compress' | 'archive' | 'discard';
}

export interface FileAdapterConfig {
  type: 'file';
  /** Absolute or relative path to the JSON file. Default: ./.request-tracker-data.json */
  path?: string;
  /** Max requests stored per file. Default: 50 000 */
  maxSize?: number;
  /** Flush-to-disk interval in ms. Default: 5000 */
  flushIntervalMs?: number;
}

export interface LoggingAdapterConfig {
  type: 'logging-only';
  /** Winston-compatible logger or any object with .info/.warn/.error. Default: console */
  logger?: any;
  /** Output format. Default: 'text' */
  format?: 'json' | 'text';
  level?: LogLevel;
  customFormatter?: (data: TrackedRequest) => string;
}

export interface MongoDBAdapterConfig {
  type: 'mongodb';
  /** MongoDB connection URI e.g. mongodb://localhost:27017/mydb */
  uri?: string;
  /** Pass an existing mongoose connection / MongoClient Db instead of a URI */
  connection?: any;
  /** Collection name. Default: 'request_tracker_logs' */
  collection?: string;
  /** Auto-delete documents older than N days (TTL index). Default: 30 */
  ttlDays?: number;
}

export interface PostgreSQLAdapterConfig {
  type: 'postgresql';
  /** PostgreSQL connection URI e.g. postgresql://user:pass@localhost:5432/mydb */
  uri?: string;
  /** Pass an existing pg Pool / Client instead of a URI */
  connection?: any;
  /** Table name. Default: 'request_tracker_logs' */
  table?: string;
  /** Auto-delete rows older than N days. Default: 30 */
  ttlDays?: number;
}

export type StorageAdapterConfig =
  | MemoryAdapterConfig
  | FileAdapterConfig
  | LoggingAdapterConfig
  | MongoDBAdapterConfig
  | PostgreSQLAdapterConfig;

/**
 * Storage configuration
 */
export interface StorageConfig {
  /**
   * Multi-adapter mode — every adapter in this array receives every write.
   * Reads (query/getAll) fall through to the first adapter that returns data.
   *
   * @example
   * storage: {
   *   adapters: [
   *     { type: 'file',         path: './logs/requests.json' },
   *     { type: 'logging-only', format: 'text' },
   *     { type: 'mongodb',      uri: 'mongodb://localhost:27017/mydb' },
   *     { type: 'memory',       maxSize: 1000 },
   *   ]
   * }
   */
  adapters?: StorageAdapterConfig[];

  // ── Legacy single-adapter config (kept for backwards compat) ──────────────
  primary?: StorageType;
  secondary?: StorageType;
  memory?: MemoryStorageConfig;
  file?: FileStorageConfig;
  database?: DatabaseStorageConfig;
  loggingOnly?: LoggingOnlyConfig;
  mongodb?: MongoDBStorageConfig;
  postgresql?: PostgreSQLStorageConfig;
}

export interface MemoryStorageConfig {
  maxSize: number; // max requests to store
  ttl: number; // time to live in milliseconds
  enableCompression: boolean;
  onMaxReached: 'compress' | 'archive' | 'discard';
}

export interface FileStorageConfig {
  path: string;
  maxFileSize: number; // bytes
  maxBackups: number;
  compression: 'gzip' | 'none';
  rotationPolicy: 'daily' | 'weekly' | 'monthly' | 'size';
  includeIndexes: boolean;
  indexFields: string[];
}

export interface DatabaseStorageConfig {
  type: 'mongodb' | 'postgresql';
  url: string;
  tableName?: string;
  maxRetention: number; // days
  autoArchive: boolean;
  batchSync: boolean;
  batchSize: number;
  syncInterval: number; // milliseconds
  indexes: IndexConfig[];
}

export interface IndexConfig {
  field: string;
  type?: 'asc' | 'desc' | 'text';
}

export interface LoggingOnlyConfig {
  logger?: any; // Winston logger or console
  format?: 'json' | 'text' | 'custom';
  level?: LogLevel;
  includeFields?: string[];
  customFormatter?: (data: TrackedRequest) => string;
}

export interface MongoDBStorageConfig {
  /** MongoDB connection URI e.g. mongodb://localhost:27017/mydb */
  uri?: string;
  /** Pass an existing mongoose connection or native MongoClient Db instead of a URI */
  connection?: any;
  /** Collection name — received from caller, defaults to 'request_tracker_logs' */
  collection?: string;
  /** Auto-delete documents older than N days via TTL index. Default: 30 */
  ttlDays?: number;
}

export interface PostgreSQLStorageConfig {
  /** PostgreSQL connection URI e.g. postgresql://user:pass@localhost:5432/mydb */
  uri?: string;
  /** Pass an existing pg Pool or Client instead of a URI */
  connection?: any;
  /** Table name — received from caller, defaults to 'request_tracker_logs' */
  table?: string;
  /** Auto-delete rows older than N days. Default: 30 */
  ttlDays?: number;
}

/**
 * Analytics data
 */
export interface RequestStats {
  totalRequests: number;
  totalDuration: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p50ResponseTime: number; // median
  p95ResponseTime: number;
  p99ResponseTime: number;
  
  // Network stats
  totalNetworkUsage: number; // bytes
  averageNetworkUsage: number;
  
  // Status codes
  statusDistribution: Record<number, number>;
  errorRate: number; // percentage
  successRate: number; // percentage
  
  // HTTP methods
  methodDistribution: Record<string, number>;
  
  // Top endpoints
  topEndpoints: EndpointStats[];
  slowestEndpoints: EndpointStats[];
}

export interface EndpointStats {
  path: string;
  method: string;
  count: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  errorRate: number;
  totalNetworkUsage: number;
}

/**
 * Query options for filtering requests
 */
export interface QueryOptions {
  method?: string;
  path?: string;
  statusCode?: number | { $gte?: number; $lte?: number };
  startTime?: number;
  endTime?: number;
  userId?: string;
  ipAddress?: string;
  minDuration?: number;
  maxDuration?: number;
  errorOnly?: boolean;
  limit?: number;
  offset?: number;
  sort?: 'asc' | 'desc';
}

/**
 * Exposed middleware interface
 */
export interface RequestTrackerMiddleware {
  (req: any, res: any, next: any): void;
}

/**
 * Admin/Dashboard data response
 */
export interface DashboardData {
  stats: RequestStats;
  recentRequests: TrackedRequest[];
  slowestRequests: TrackedRequest[];
  erroredRequests: TrackedRequest[];
  networkUsageByEndpoint: { path: string; usage: number }[];
  latencyTrends: { timestamp: number; avgLatency: number }[];
}

export interface RequestTrackerInstance {
  middleware(): RequestTrackerMiddleware;
  getStats(): Promise<RequestStats>;
  getDashboardData(): Promise<DashboardData>;
  query(options: QueryOptions): Promise<TrackedRequest[]>;
  clearOldRecords(options: ClearOptions): Promise<void>;
  getNetworkAnalytics(path?: string): Promise<NetworkAnalytics>;
  compressRecords(options: CompressOptions): Promise<void>;
  exportData(format: 'json' | 'csv'): Promise<string>;
  getRecentRequests(limit: number): Promise<TrackedRequest[]>;
  getSlowestRequests(limit: number): Promise<TrackedRequest[]>;
  getErroredRequests(limit: number): Promise<TrackedRequest[]>;
  getTopEndpoints(limit: number): Promise<EndpointStats[]>;
  clearAll(): Promise<void>;
}

export interface ClearOptions {
  olderThan: string; // e.g., '7-days', '30-days-ago'
  moveToArchive?: boolean;
}

export interface CompressOptions {
  before: string; // e.g., '30-days-ago'
  compression: 'gzip' | 'brotli';
}

export interface NetworkAnalytics {
  path: string;
  totalRequests: number;
  totalNetworkUsage: number;
  averageNetworkUsage: number;
  requestDataUsage: number;
  responseDataUsage: number;
  costEstimate?: number; // for bandwidth pricing
}
