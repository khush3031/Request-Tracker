import { StorageAdapter, applyQueryFilters } from './base.js';
import { TrackedRequest, PostgreSQLStorageConfig, QueryOptions } from '../types.js';
import { RequestFormatter } from '../utils/formatter.js';

/**
 * PostgreSQL storage adapter
 * Persists tracked requests to a PostgreSQL table.
 * Accepts either an existing pg Pool/Client or a connection URI string.
 * Table name defaults to 'request_tracker_logs' if not provided.
 */
export class PostgreSQLStorage extends StorageAdapter {
  private config: PostgreSQLStorageConfig;
  private pool: any = null;
  private ready: Promise<void>;

  constructor(config: PostgreSQLStorageConfig) {
    super();
    this.config = {
      table: 'request_tracker_logs',
      ttlDays: 30,
      ...config
    };
    this.ready = this.connect();
  }

  private async connect(): Promise<void> {
    let Pool: any;
    try {
      ({ Pool } = require('pg'));
    } catch {
      throw new Error(
        '[RequestTracker] PostgreSQLStorage requires the "pg" package. Run: npm install pg'
      );
    }

    if (this.config.connection) {
      // Use existing pool/client passed by the caller
      this.pool = this.config.connection;
    } else if (this.config.uri) {
      this.pool = new Pool({ connectionString: this.config.uri });
    } else {
      throw new Error(
        '[RequestTracker] PostgreSQLStorage requires either "uri" or "connection"'
      );
    }

    await this.ensureTable();
  }

  private async ensureTable(): Promise<void> {
    const table = this.config.table || 'request_tracker_logs';
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "${table}" (
        id               TEXT PRIMARY KEY,
        timestamp        BIGINT NOT NULL,
        method           TEXT NOT NULL,
        path             TEXT NOT NULL,
        full_url         TEXT,
        status_code      INTEGER NOT NULL,
        status_message   TEXT,
        start_time       BIGINT,
        end_time         BIGINT,
        duration         INTEGER NOT NULL,
        request_size     INTEGER DEFAULT 0,
        response_size    INTEGER DEFAULT 0,
        network_usage    INTEGER DEFAULT 0,
        request_headers  JSONB,
        response_headers JSONB,
        query_params     JSONB,
        request_body     JSONB,
        response_body    JSONB,
        user_id          TEXT,
        session_id       TEXT,
        user_agent       TEXT,
        ip_address       TEXT,
        error            JSONB,
        custom           JSONB,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Indexes for common query patterns
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS "${table}_timestamp_idx" ON "${table}" (timestamp DESC);
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS "${table}_path_method_idx" ON "${table}" (path, method);
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS "${table}_status_code_idx" ON "${table}" (status_code);
    `);
  }

  /**
   * Remove rows older than ttlDays — called on each save (lightweight check)
   */
  private async purgeTTL(): Promise<void> {
    if (!this.config.ttlDays || this.config.ttlDays <= 0) return;
    const cutoff = Date.now() - this.config.ttlDays * 24 * 60 * 60 * 1000;
    const table = this.config.table || 'request_tracker_logs';
    await this.pool.query(`DELETE FROM "${table}" WHERE timestamp < $1`, [cutoff]).catch(() => {});
  }

  async save(request: TrackedRequest): Promise<void> {
    await this.ready;
    const table = this.config.table || 'request_tracker_logs';
    await this.pool.query(
      `INSERT INTO "${table}" (
        id, timestamp, method, path, full_url, status_code, status_message,
        start_time, end_time, duration, request_size, response_size, network_usage,
        request_headers, response_headers, query_params, request_body, response_body,
        user_id, session_id, user_agent, ip_address, error, custom
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
      ) ON CONFLICT (id) DO NOTHING`,
      [
        request.id,
        request.timestamp,
        request.method,
        request.path,
        request.fullUrl ?? null,
        request.statusCode,
        request.statusMessage ?? null,
        request.startTime ?? null,
        request.endTime ?? null,
        request.duration,
        request.requestSize ?? 0,
        request.responseSize ?? 0,
        request.networkUsage ?? 0,
        request.requestHeaders ? JSON.stringify(request.requestHeaders) : null,
        request.responseHeaders ? JSON.stringify(request.responseHeaders) : null,
        request.queryParams ? JSON.stringify(request.queryParams) : null,
        request.requestBody ? JSON.stringify(request.requestBody) : null,
        request.responseBody ? JSON.stringify(request.responseBody) : null,
        request.userId ?? null,
        request.sessionId ?? null,
        request.userAgent ?? null,
        request.ipAddress ?? null,
        request.error ? JSON.stringify(request.error) : null,
        request.custom ? JSON.stringify(request.custom) : null
      ]
    );
    // Async TTL purge — don't block the response
    this.purgeTTL().catch(() => {});
  }

  async saveBatch(requests: TrackedRequest[]): Promise<void> {
    await this.ready;
    if (requests.length === 0) return;
    await Promise.all(requests.map(r => this.save(r)));
  }

  async get(id: string): Promise<TrackedRequest | null> {
    await this.ready;
    const table = this.config.table || 'request_tracker_logs';
    const { rows } = await this.pool.query(`SELECT * FROM "${table}" WHERE id = $1`, [id]);
    return rows.length ? this.toTrackedRequest(rows[0]) : null;
  }

  async query(options: QueryOptions): Promise<TrackedRequest[]> {
    await this.ready;
    const table = this.config.table || 'request_tracker_logs';
    const conditions: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (options.method) { conditions.push(`method = $${i++}`); params.push(options.method); }
    if (options.path)   { conditions.push(`path = $${i++}`);   params.push(options.path); }
    if (options.userId) { conditions.push(`user_id = $${i++}`); params.push(options.userId); }
    if (options.ipAddress) { conditions.push(`ip_address = $${i++}`); params.push(options.ipAddress); }
    if (options.errorOnly)  { conditions.push(`status_code >= 400`); }

    if (typeof options.statusCode === 'number') {
      conditions.push(`status_code = $${i++}`);
      params.push(options.statusCode);
    } else if (options.statusCode && typeof options.statusCode === 'object') {
      if (options.statusCode.$gte) { conditions.push(`status_code >= $${i++}`); params.push(options.statusCode.$gte); }
      if (options.statusCode.$lte) { conditions.push(`status_code <= $${i++}`); params.push(options.statusCode.$lte); }
    }

    if (options.startTime) { conditions.push(`timestamp >= $${i++}`); params.push(options.startTime); }
    if (options.endTime)   { conditions.push(`timestamp <= $${i++}`); params.push(options.endTime); }
    if (options.minDuration) { conditions.push(`duration >= $${i++}`); params.push(options.minDuration); }
    if (options.maxDuration) { conditions.push(`duration <= $${i++}`); params.push(options.maxDuration); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const order = options.sort === 'asc' ? 'ASC' : 'DESC';
    const limit = options.limit || 1000;
    const offset = options.offset || 0;

    const { rows } = await this.pool.query(
      `SELECT * FROM "${table}" ${where} ORDER BY timestamp ${order} LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    return rows.map((r: any) => this.toTrackedRequest(r));
  }

  async getAll(): Promise<TrackedRequest[]> {
    await this.ready;
    const table = this.config.table || 'request_tracker_logs';
    const { rows } = await this.pool.query(
      `SELECT * FROM "${table}" ORDER BY timestamp DESC LIMIT 5000`
    );
    return rows.map((r: any) => this.toTrackedRequest(r));
  }

  async delete(id: string): Promise<void> {
    await this.ready;
    const table = this.config.table || 'request_tracker_logs';
    await this.pool.query(`DELETE FROM "${table}" WHERE id = $1`, [id]);
  }

  async clear(): Promise<void> {
    await this.ready;
    const table = this.config.table || 'request_tracker_logs';
    await this.pool.query(`DELETE FROM "${table}"`);
  }

  async count(): Promise<number> {
    await this.ready;
    const table = this.config.table || 'request_tracker_logs';
    const { rows } = await this.pool.query(`SELECT COUNT(*) FROM "${table}"`);
    return parseInt(rows[0].count, 10);
  }

  async export(format: 'json' | 'csv'): Promise<string> {
    const requests = await this.getAll();
    if (format === 'json') return JSON.stringify(requests, null, 2);
    const lines = [RequestFormatter.getCSVHeader()];
    lines.push(...requests.map(r => RequestFormatter.toCSV(r)));
    return lines.join('\n');
  }

  /**
   * Map a PostgreSQL row (snake_case) back to TrackedRequest (camelCase)
   */
  private toTrackedRequest(row: any): TrackedRequest {
    return {
      id:              row.id,
      timestamp:       Number(row.timestamp),
      method:          row.method,
      path:            row.path,
      fullUrl:         row.full_url,
      statusCode:      row.status_code,
      statusMessage:   row.status_message,
      startTime:       Number(row.start_time),
      endTime:         Number(row.end_time),
      duration:        row.duration,
      requestSize:     row.request_size,
      responseSize:    row.response_size,
      networkUsage:    row.network_usage,
      requestHeaders:  row.request_headers,
      responseHeaders: row.response_headers,
      queryParams:     row.query_params,
      requestBody:     row.request_body,
      responseBody:    row.response_body,
      userId:          row.user_id,
      sessionId:       row.session_id,
      userAgent:       row.user_agent,
      ipAddress:       row.ip_address,
      error:           row.error,
      custom:          row.custom
    };
  }

  /**
   * Close the pool (only if we created it via URI)
   */
  async destroy(): Promise<void> {
    if (!this.config.connection && this.pool) {
      await this.pool.end();
    }
  }
}
