/**
 * 数据库种子 — 首次启动时把 .env.local 的管理员账号迁入 DB。
 * 由 getDb() 后的首次 API 调用触发（幂等）。
 */

import { getDb, schema } from "./index";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export async function seedAdminFromEnv(): Promise<void> {
  const db = getDb();

  const existingUsers = db.select().from(schema.users).all();
  if (existingUsers.length > 0) return;

  const raw = process.env.AUTH_USERS;
  if (!raw) return;

  let envUsers: { u: string; p: string }[];
  try {
    envUsers = JSON.parse(raw);
    if (!Array.isArray(envUsers)) return;
  } catch {
    return;
  }

  const now = Date.now();
  for (const eu of envUsers) {
    if (!eu.u || !eu.p) continue;
    const id = `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const hash = await bcrypt.hash(eu.p, SALT_ROUNDS);
    db.insert(schema.users).values({
      id,
      username: eu.u,
      passwordHash: hash,
      role: "admin",
      createdAt: now,
      updatedAt: now,
    }).run();
    console.info(`[db:seed] migrated admin user: ${eu.u}`);
  }
}
