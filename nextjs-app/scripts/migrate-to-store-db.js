#!/usr/bin/env node
/**
 * One-shot migration: merges the legacy per-user event databases
 * (USER_DATABASES_PATH/<userId>.db) into the single shared store database
 * (STORE_DATABASE_PATH).
 *
 *   node scripts/migrate-to-store-db.js
 *
 * - Skips Shopify token events entirely (they contain secrets and the event
 *   type no longer exists); the admin re-connects the store instead.
 * - Backfills createdByUserId into BeginProductCreated event data from the
 *   source database's filename.
 * - Leaves the source databases untouched; archive data/users/ manually
 *   once the migration is verified.
 * - Aborts if the store database already contains events (delete it to
 *   re-run).
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const USER_DATABASES_PATH = process.env.USER_DATABASES_PATH || './data/users';
const STORE_DATABASE_PATH = process.env.STORE_DATABASE_PATH || './data/store.db';

const EVENTS_DDL = `
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
`;

function main() {
  if (!fs.existsSync(USER_DATABASES_PATH)) {
    console.log(`No user databases directory at ${USER_DATABASES_PATH}; nothing to migrate.`);
    return;
  }

  const userDbFiles = fs.readdirSync(USER_DATABASES_PATH).filter(f => f.endsWith('.db'));
  if (userDbFiles.length === 0) {
    console.log(`No user databases found in ${USER_DATABASES_PATH}; nothing to migrate.`);
    return;
  }

  fs.mkdirSync(path.dirname(STORE_DATABASE_PATH), { recursive: true });
  const storeDb = new Database(STORE_DATABASE_PATH);
  storeDb.exec(EVENTS_DDL);

  const existing = storeDb.prepare('SELECT COUNT(*) AS count FROM events').get();
  if (existing.count > 0) {
    console.error(
      `Store database ${STORE_DATABASE_PATH} already contains ${existing.count} events. ` +
      'Aborting; delete it first to re-run the migration.'
    );
    process.exit(1);
  }

  // Collect events from every user DB, tagged with the source user
  const allRows = [];
  let skippedTokenEvents = 0;

  for (const file of userDbFiles) {
    const userId = file.replace(/\.db$/, '');
    const sourcePath = path.join(USER_DATABASES_PATH, file);
    const sourceDb = new Database(sourcePath, { readonly: true });

    const rows = sourceDb.prepare(
      'SELECT id, aggregate_id, event_type, event_data, photo_blob, timestamp, version FROM events'
    ).all();

    for (const row of rows) {
      if (row.aggregate_id === 'shopify-auth' || row.event_type === 'ShopifyTokenReceived') {
        skippedTokenEvents++;
        continue;
      }

      if (row.event_type === 'BeginProductCreated') {
        const data = JSON.parse(row.event_data);
        data.createdByUserId = userId;
        row.event_data = JSON.stringify(data);
      }

      allRows.push({ ...row, sourceUserId: userId });
    }

    sourceDb.close();
    console.log(`Read ${rows.length} events from ${file}`);
  }

  // Global chronological order; source user + original id break timestamp ties
  allRows.sort((a, b) =>
    (a.timestamp - b.timestamp) ||
    a.sourceUserId.localeCompare(b.sourceUserId) ||
    (a.id - b.id)
  );

  const insert = storeDb.prepare(`
    INSERT INTO events (aggregate_id, event_type, event_data, photo_blob, timestamp, version)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let blobBytes = 0;
  const insertAll = storeDb.transaction(rows => {
    for (const row of rows) {
      insert.run(
        row.aggregate_id,
        row.event_type,
        row.event_data,
        row.photo_blob || null,
        row.timestamp,
        row.version
      );
      if (row.photo_blob) blobBytes += row.photo_blob.length;
    }
  });
  insertAll(allRows);

  const byType = storeDb.prepare(
    'SELECT event_type, COUNT(*) AS count FROM events GROUP BY event_type ORDER BY event_type'
  ).all();

  console.log('\nMigration complete.');
  console.log(`  Source databases: ${userDbFiles.length}`);
  console.log(`  Events copied:    ${allRows.length}`);
  console.log(`  Token events skipped: ${skippedTokenEvents}`);
  console.log(`  Photo blob bytes: ${blobBytes}`);
  console.log('  Events by type:');
  for (const row of byType) {
    console.log(`    ${row.event_type}: ${row.count}`);
  }
  console.log(`\nSource databases in ${USER_DATABASES_PATH} were left untouched; archive them manually.`);
  console.log('Remember: the Shopify connection is NOT migrated — an admin must connect the store from the dashboard.');

  storeDb.close();
}

main();
