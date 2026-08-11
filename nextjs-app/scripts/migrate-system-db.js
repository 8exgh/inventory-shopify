#!/usr/bin/env node
/**
 * System-database migrations, applied at container startup before the app
 * boots (see Dockerfile CMD). Safe to run repeatedly:
 *
 * - A __db_migration_history table records applied migrations by id;
 *   absence of a row means the migration runs, and the row is inserted in
 *   the same transaction as the migration itself.
 * - Migrations must tolerate fresh databases (the app's own
 *   CREATE TABLE IF NOT EXISTS creates the current schema on first boot).
 *
 * Local dev: node scripts/migrate-system-db.js
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATABASE_PATH = process.env.DATABASE_PATH || './data/system.db';

const MIGRATIONS = [
  {
    // Pre-multi-tenancy databases have a users table without tenant_id
    // ("table users has no column named tenant_id" on registration/login).
    id: '001-users-tenant-id',
    run(db) {
      const usersTable = db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'"
      ).get();
      if (!usersTable) {
        // Fresh database: the app creates the current schema itself
        return;
      }

      db.exec('CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL)');

      const columns = db.prepare('PRAGMA table_info(users)').all();
      if (!columns.some(c => c.name === 'tenant_id')) {
        db.exec(`ALTER TABLE users ADD COLUMN tenant_id TEXT NOT NULL DEFAULT ''`);
      }

      // All pre-migration users belonged to one store: gather them into a
      // single new tenant so existing accounts keep working.
      const orphans = db.prepare(`SELECT COUNT(*) AS count FROM users WHERE tenant_id = ''`).get();
      if (orphans.count > 0) {
        const tenantId = crypto.randomUUID();
        db.prepare('INSERT INTO tenants (id, created_at) VALUES (?, ?)').run(tenantId, Date.now());
        db.prepare(`UPDATE users SET tenant_id = ? WHERE tenant_id = ''`).run(tenantId);
        console.log(`[migrate] Assigned ${orphans.count} existing user(s) to new tenant ${tenantId}`);
      }

      db.exec('CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)');
    }
  }
,
  {
    // Billing cache columns for Shopify App Pricing status
    id: '002-connection-billing-columns',
    run(db) {
      const table = db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='shopify_connections'"
      ).get();
      if (!table) {
        return; // fresh database: app DDL creates the full schema
      }
      const columns = db.prepare('PRAGMA table_info(shopify_connections)').all().map(c => c.name);
      for (const [name, type] of [
        ['shop_numeric_id', 'TEXT'],
        ['subscription_status', 'TEXT'],
        ['trial_ends_at', 'TEXT'],
        ['subscription_checked_at', 'INTEGER']
      ]) {
        if (!columns.includes(name)) {
          db.exec(`ALTER TABLE shopify_connections ADD COLUMN ${name} ${type}`);
        }
      }
    }
  }
,
  {
    // Shopify stopped accepting non-expiring offline tokens on the Admin API
    // ("[API] Non-expiring access tokens are no longer accepted"), so every
    // connection now carries an expiry and a refresh token.
    id: '003-expiring-offline-tokens',
    run(db) {
      const table = db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='shopify_connections'"
      ).get();
      if (!table) {
        return; // fresh database: app DDL creates the full schema
      }
      const columns = db.prepare('PRAGMA table_info(shopify_connections)').all().map(c => c.name);
      for (const [name, type] of [
        ['token_expires_at', 'INTEGER'],
        ['refresh_token', 'TEXT'],
        ['refresh_token_expires_at', 'INTEGER']
      ]) {
        if (!columns.includes(name)) {
          db.exec(`ALTER TABLE shopify_connections ADD COLUMN ${name} ${type}`);
        }
      }
      // Tokens minted before this change are non-expiring and already
      // rejected by Shopify. Leaving them in place would keep the processor
      // hammering a dead token; clearing the expiry marks them for renewal
      // on the merchant's next embedded load (token exchange re-provisions).
      db.prepare(
        `UPDATE shopify_connections SET token_expires_at = 0 WHERE token_expires_at IS NULL`
      ).run();
    }
  }
];

function main() {
  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
  const db = new Database(DATABASE_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS __db_migration_history (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const isApplied = db.prepare('SELECT 1 FROM __db_migration_history WHERE id = ?');
  const record = db.prepare('INSERT INTO __db_migration_history (id, applied_at) VALUES (?, ?)');

  for (const migration of MIGRATIONS) {
    if (isApplied.get(migration.id)) {
      console.log(`[migrate] ${migration.id}: already applied`);
      continue;
    }

    console.log(`[migrate] ${migration.id}: applying...`);
    db.transaction(() => {
      migration.run(db);
      record.run(migration.id, Date.now());
    })();
    console.log(`[migrate] ${migration.id}: applied`);
  }

  db.close();
  console.log(`[migrate] System database migrations complete (${DATABASE_PATH})`);
}

main();
