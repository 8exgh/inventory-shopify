import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Event } from '@/types/events';

function getUserDatabasePath(): string {
  const USER_DATABASES_PATH = process.env.USER_DATABASES_PATH || './data/users';
  return USER_DATABASES_PATH;
}

// Ensure users directory exists
if (!fs.existsSync(getUserDatabasePath())) {
  fs.mkdirSync(getUserDatabasePath(), { recursive: true });
}

const userDbs: Map<string, Database.Database> = new Map();

export function getUserDb(userId: string): Database.Database {
  if (!userDbs.has(userId)) {
    const dbPath = path.join(getUserDatabasePath(), `${userId}.db`);
    const db = new Database(dbPath);
    initializeUserDb(db);
    userDbs.set(userId, db);
  }
  return userDbs.get(userId)!;
}

function initializeUserDb(db: Database.Database): void {
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

export function insertEvent(userId: string, params: InsertEventParams): void {
  const db = getUserDb(userId);
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

export function loadEvents(userId: string, aggregateId: string): Event[] {
  const db = getUserDb(userId);
  return db.prepare('SELECT * FROM events WHERE aggregate_id = ? ORDER BY version ASC')
    .all(aggregateId) as Event[];
}

export function loadAllEvents(userId: string): Event[] {
  const db = getUserDb(userId);
  return db.prepare('SELECT * FROM events ORDER BY timestamp ASC').all() as Event[];
}

export function getEventsByType(userId: string, eventType: string): Event[] {
  const db = getUserDb(userId);
  return db.prepare('SELECT * FROM events WHERE event_type = ? ORDER BY timestamp ASC')
    .all(eventType) as Event[];
}

export function getPhotoBlob(
  userId: string,
  aggregateId: string,
  eventType: string = 'BeginProductCreated'
): Buffer | null {
  const db = getUserDb(userId);
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

export function getEventCount(userId: string, aggregateId: string, eventType: string): number {
  const db = getUserDb(userId);
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM events
    WHERE aggregate_id = ? AND event_type = ?
  `).get(aggregateId, eventType) as { count: number };

  return result.count;
}

export function getAllUserDatabases(): string[] {
  if (!fs.existsSync(getUserDatabasePath())) {
    return [];
  }

  const files = fs.readdirSync(getUserDatabasePath());
  return files
    .filter(file => file.endsWith('.db'))
    .map(file => file.replace('.db', ''));
}
