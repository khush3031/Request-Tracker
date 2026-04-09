import { StorageAdapter, applyQueryFilters } from './base.js';
import { TrackedRequest, MongoDBStorageConfig, QueryOptions } from '../types.js';
import { RequestFormatter } from '../utils/formatter.js';

/**
 * MongoDB storage adapter
 * Persists tracked requests to a MongoDB collection.
 * Accepts either an existing mongoose/mongodb connection or a URI string.
 * Collection name defaults to 'request_tracker_logs' if not provided.
 */
export class MongoDBStorage extends StorageAdapter {
  private config: MongoDBStorageConfig;
  private collection: any = null;
  private client: any = null;
  private ready: Promise<void>;
  private connectError: Error | null = null;

  constructor(config: MongoDBStorageConfig) {
    super();
    this.config = {
      collection: 'request_tracker_logs',
      ttlDays: 30,
      ...config
    };
    // Catch here so the unhandled-rejection handler never fires —
    // individual adapter failures are handled gracefully by MultiStorage.
    this.ready = this.connect().catch(err => {
      this.connectError = err;
      console.warn(`[RequestTracker] MongoDB adapter disabled: ${err.message}`);
    });
  }

  private async connect(): Promise<void> {
    const collectionName = this.config.collection || 'request_tracker_logs';

    // Use existing mongoose/mongodb connection if provided
    if (this.config.connection) {
      const conn = this.config.connection;
      const db = conn.db ?? conn;
      this.collection = db.collection(collectionName);
      await this.ensureIndexes();
      return;
    }

    if (!this.config.uri) {
      throw new Error('[RequestTracker] MongoDBStorage requires either "uri" or "connection"');
    }

    let MongoClient: any;
    try {
      // Dynamic import works in both ESM and CJS (unlike require which fails in ESM).
      // @ts-ignore — mongodb is an optional peer dep; not in devDependencies
      const mod = await import('mongodb');
      MongoClient = mod.MongoClient ?? (mod as any).default?.MongoClient;
    } catch {
      throw new Error(
        '[RequestTracker] MongoDBStorage requires the "mongodb" package. Run: npm install mongodb'
      );
    }

    this.client = new MongoClient(this.config.uri);
    await this.client.connect();
    const db = this.client.db();
    this.collection = db.collection(collectionName);
    await this.ensureIndexes();
  }

  private async ensureIndexes(): Promise<void> {
    try {
      // Index for time-based queries (most common)
      await this.collection.createIndex({ timestamp: -1 });
      // Index for path + method queries
      await this.collection.createIndex({ path: 1, method: 1 });
      // Index for status code filtering
      await this.collection.createIndex({ statusCode: 1 });
      // TTL index — auto-delete documents after ttlDays
      if (this.config.ttlDays && this.config.ttlDays > 0) {
        await this.collection.createIndex(
          { createdAt: 1 },
          { expireAfterSeconds: this.config.ttlDays * 24 * 60 * 60 }
        );
      }
    } catch {
      // Index creation failures are non-fatal
    }
  }

  async save(request: TrackedRequest): Promise<void> {
    await this.ready;
    if (this.connectError) return;
    await this.collection.insertOne({
      ...request,
      _id: request.id as any,
      createdAt: new Date(request.timestamp)
    });
  }

  async saveBatch(requests: TrackedRequest[]): Promise<void> {
    await this.ready;
    if (this.connectError || requests.length === 0) return;
    const docs = requests.map(r => ({
      ...r,
      _id: r.id as any,
      createdAt: new Date(r.timestamp)
    }));
    await this.collection.insertMany(docs, { ordered: false }).catch(() => {
      // ignore duplicate key errors on retry
    });
  }

  async get(id: string): Promise<TrackedRequest | null> {
    await this.ready;
    if (this.connectError) return null;
    const doc = await this.collection.findOne({ _id: id as any });
    return doc ? this.toTrackedRequest(doc) : null;
  }

  async query(options: QueryOptions): Promise<TrackedRequest[]> {
    await this.ready;
    if (this.connectError) return [];
    const filter: Record<string, any> = {};

    if (options.method) filter.method = options.method;
    if (options.path) filter.path = options.path;
    if (options.userId) filter.userId = options.userId;
    if (options.ipAddress) filter.ipAddress = options.ipAddress;
    if (options.errorOnly) filter.statusCode = { $gte: 400 };

    if (options.statusCode) {
      if (typeof options.statusCode === 'number') {
        filter.statusCode = options.statusCode;
      } else {
        filter.statusCode = {};
        if (options.statusCode.$gte) filter.statusCode.$gte = options.statusCode.$gte;
        if (options.statusCode.$lte) filter.statusCode.$lte = options.statusCode.$lte;
      }
    }

    if (options.startTime || options.endTime) {
      filter.timestamp = {};
      if (options.startTime) filter.timestamp.$gte = options.startTime;
      if (options.endTime) filter.timestamp.$lte = options.endTime;
    }

    if (options.minDuration || options.maxDuration) {
      filter.duration = {};
      if (options.minDuration) filter.duration.$gte = options.minDuration;
      if (options.maxDuration) filter.duration.$lte = options.maxDuration;
    }

    const sort = { timestamp: options.sort === 'asc' ? 1 : -1 } as any;
    const skip = options.offset || 0;
    const limit = options.limit || 1000;

    const docs = await this.collection.find(filter).sort(sort).skip(skip).limit(limit).toArray();
    return docs.map((d: any) => this.toTrackedRequest(d));
  }

  async getAll(): Promise<TrackedRequest[]> {
    await this.ready;
    if (this.connectError) return [];
    const docs = await this.collection.find({}).sort({ timestamp: -1 }).limit(5000).toArray();
    return docs.map((d: any) => this.toTrackedRequest(d));
  }

  async delete(id: string): Promise<void> {
    await this.ready;
    if (this.connectError) return;
    await this.collection.deleteOne({ _id: id as any });
  }

  async clear(): Promise<void> {
    await this.ready;
    if (this.connectError) return;
    await this.collection.deleteMany({});
  }

  async count(): Promise<number> {
    await this.ready;
    if (this.connectError) return 0;
    return this.collection.countDocuments();
  }

  async export(format: 'json' | 'csv'): Promise<string> {
    const requests = await this.getAll();
    if (format === 'json') return JSON.stringify(requests, null, 2);
    const lines = [RequestFormatter.getCSVHeader()];
    lines.push(...requests.map(r => RequestFormatter.toCSV(r)));
    return lines.join('\n');
  }

  /**
   * Strip MongoDB _id and createdAt fields before returning
   */
  private toTrackedRequest(doc: any): TrackedRequest {
    const { _id, createdAt, ...rest } = doc;
    return rest as TrackedRequest;
  }

  /**
   * Close the MongoDB connection (only if we opened it via URI)
   */
  async destroy(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }
}
