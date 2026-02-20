import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

const DB_PATH = resolve(import.meta.dirname, '../../data/agentcorp.db');
mkdirSync(resolve(import.meta.dirname, '../../data'), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite);

migrate(db, { migrationsFolder: resolve(import.meta.dirname, './migrations') });

console.log('Migration completed.');
sqlite.close();
