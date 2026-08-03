import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Event } from '@/types/events';

function getStoreDatabasePath(): string {
  return process.env.STORE_DATABASE_PATH || './data/store.db';
}

let storeDb: Database.Database | null = null;

export function getStoreDb(): Database.Database {
  if (!storeDb) {
    const dbPath = getStoreDatabasePath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    storeDb = new Database(dbPath);
    initializeStoreDb(storeDb);
  }
  return storeDb;
}

function initializeStoreDb(db: Database.Database): void {
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

export function insertEvent(params: InsertEventParams): void {
  const db = getStoreDb();
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

export function loadEvents(aggregateId: string): Event[] {
  const db = getStoreDb();
  return db.prepare('SELECT * FROM events WHERE aggregate_id = ? ORDER BY version ASC')
    .all(aggregateId) as Event[];
}

export function loadAllEvents(): Event[] {
  const db = getStoreDb();
  return db.prepare('SELECT * FROM events ORDER BY timestamp ASC').all() as Event[];
}

export function getPhotoBlob(
  aggregateId: string,
  eventType: string = 'BeginProductCreated'
): Buffer | null {
  const db = getStoreDb();
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
