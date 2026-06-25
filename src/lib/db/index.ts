/**
 * Database 单例 — SQLite via better-sqlite3 + Drizzle ORM。
 * 数据库文件 `data/frame0.db`，首次访问自动建表。
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

const DB_PATH = path.join(process.cwd(), "data", "frame0.db");

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  _db = drizzle(sqlite, { schema });

  initTables(sqlite);

  return _db;
}

function initTables(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invite_codes (
      code TEXT PRIMARY KEY,
      created_by TEXT NOT NULL REFERENCES users(id),
      used_by TEXT REFERENCES users(id),
      used_at INTEGER,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      model_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitting',
      prompt TEXT,
      negative_prompt TEXT,
      params TEXT,
      media TEXT,
      task_id TEXT,
      video_url TEXT,
      error_message TEXT,
      title TEXT,
      published INTEGER DEFAULT 0,
      favorite INTEGER DEFAULT 0,
      tags TEXT,
      note TEXT,
      category TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_invite_codes_used ON invite_codes(used_by);

    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS org_members (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL DEFAULT 'member',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id),
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'comic',
      data TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(org_id);
    CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id);
  `);
}

export { schema };
