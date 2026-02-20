import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema/index.js';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

const DB_PATH = process.env.AGENTCORP_DB_PATH || resolve(import.meta.dirname, '../../data/agentcorp.db');

// Ensure data directory exists
mkdirSync(resolve(DB_PATH, '..'), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

export * from './schema/index.js';
export { generateId, now } from './utils.js';
