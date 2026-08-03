import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

function getDatabasePath(): string {
  const DATABASE_PATH = process.env.DATABASE_PATH || './data/system.db';
  return DATABASE_PATH;
}

// Ensure data directory exists
const dataDir = path.dirname(getDatabasePath());
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'restocker';
  must_change_password: number; // SQLite uses 0/1 for boolean
  created_at: number;
}

let db: Database.Database | null = null;

export function getSystemDb(): Database.Database {
  if (!db) {
    db = new Database(getDatabasePath());
    initializeSystemDb(db);
  }
  return db;
}

function initializeSystemDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'restocker')),
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      UNIQUE(email)
    );

    CREATE TABLE IF NOT EXISTS shopify_connection (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      shop TEXT NOT NULL,
      access_token TEXT NOT NULL,
      scope TEXT NOT NULL,
      location_id TEXT NOT NULL,
      connected_by_user_id TEXT NOT NULL,
      connected_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected'))
    );
  `);
}

export function getUserByEmail(email: string): User | undefined {
  const db = getSystemDb();
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;
}

export function getUserById(id: string): User | undefined {
  const db = getSystemDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

export function createUser(user: Omit<User, 'created_at'> & { created_at?: number }): void {
  const db = getSystemDb();
  const created_at = user.created_at || Date.now();

  db.prepare(`
    INSERT INTO users (id, email, password_hash, role, must_change_password, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(user.id, user.email, user.password_hash, user.role, user.must_change_password, created_at);
}

export function updateUserPassword(userId: string, newPasswordHash: string, mustChangePassword: number = 0): void {
  const db = getSystemDb();
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?')
    .run(newPasswordHash, mustChangePassword, userId);
}

export function hasAnyUsers(): boolean {
  const db = getSystemDb();
  const result = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  return result.count > 0;
}

export function getAllUsers(): User[] {
  const db = getSystemDb();
  return db.prepare('SELECT * FROM users').all() as User[];
}
