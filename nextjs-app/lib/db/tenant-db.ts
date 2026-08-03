import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Event } from '@/types/events';
import { tenantExists } from './system';

function getTenantDatabasesPath(): string {
  return process.env.TENANT_DATABASES_PATH || './data/tenants';
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// TODO: LRU-close handles if tenant count approaches ~500 (one fd per tenant)
const tenantDbs: Map<string, Database.Database> = new Map();

export function getTenantDb(tenantId: string): Database.Database {
  if (!tenantDbs.has(tenantId)) {
    // tenantId can arrive from API-key request params: reject anything that
    // isn't a known tenant before it touches the filesystem.
    if (!UUID_PATTERN.test(tenantId) || !tenantExists(tenantId)) {
      throw new Error('Unknown tenant');
    }
    const dir = getTenantDatabasesPath();
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, `${tenantId}.db`));
    initializeTenantDb(db);
    tenantDbs.set(tenantId, db);
  }
  return tenantDbs.get(tenantId)!;
}

function initializeTenantDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      aggregate_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_data TEXT NOT NULL,
      photo_blob BLOB,
      timestamp INTEGER NOT NULL,
      version INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_aggregate_id ON events(aggregate_id);
    CREATE INDEX IF NOT EXISTS idx_event_type ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_timestamp ON events(timestamp);
  `);
}

export interface InsertEventParams {
  aggregateId: string;
  eventType: string;
  eventData: string;
  photoBlob?: Buffer | null;
  timestamp: number;
  version: number;
}

export function insertEvent(tenantId: string, params: InsertEventParams): void {
  const db = getTenantDb(tenantId);
  db.prepare(`
    INSERT INTO events (aggregate_id, event_type, event_data, photo_blob, timestamp, version)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    params.aggregateId,
    params.eventType,
    params.eventData,
    params.photoBlob || null,
    params.timestamp,
    params.version
  );
}

export function loadEvents(tenantId: string, aggregateId: string): Event[] {
  const db = getTenantDb(tenantId);
  return db.prepare('SELECT * FROM events WHERE aggregate_id = ? ORDER BY version ASC')
    .all(aggregateId) as Event[];
}

export function loadAllEvents(tenantId: string): Event[] {
  const db = getTenantDb(tenantId);
  return db.prepare('SELECT * FROM events ORDER BY timestamp ASC').all() as Event[];
}

export function getPhotoBlob(
  tenantId: string,
  aggregateId: string,
  eventType: string = 'BeginProductCreated'
): Buffer | null {
  const db = getTenantDb(tenantId);
  // Ordered so that if a retry ever writes a second blob-carrying event
  // (e.g. ProductImageProcessed), the most recent one wins.
  const result = db.prepare(`
    SELECT photo_blob FROM events
    WHERE aggregate_id = ? AND event_type = ?
    ORDER BY version DESC
    LIMIT 1
  `).get(aggregateId, eventType) as { photo_blob: Buffer | null } | undefined;

  return result?.photo_blob || null;
}
