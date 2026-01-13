/**
 * SQLite Database Connection
 *
 * Singleton database connection with automatic schema migration.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { SCHEMA } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

/**
 * Get or create the database connection
 *
 * @param dbPath - Optional path to the database file
 * @returns The database connection
 */
export function getDatabase(dbPath?: string): Database.Database {
  if (db) {
    return db;
  }

  const resolvedPath = dbPath ?? process.env.DB_PATH ?? path.join(__dirname, '../../cache.db');

  db = new Database(resolvedPath);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  // Initialize schema
  db.exec(SCHEMA);

  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Check if the database is connected
 */
export function isDatabaseConnected(): boolean {
  return db !== null;
}
