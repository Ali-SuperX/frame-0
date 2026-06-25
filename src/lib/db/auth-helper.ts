/**
 * API 路由通用鉴权 helper — 从 cookie 获取当前用户。
 */
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth";
import { getDb, schema } from "./index";
import { eq } from "drizzle-orm";
import type { DbUser } from "./schema";

export async function getCurrentUser(): Promise<DbUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const session = await verifyToken(token);
  if (!session) return null;

  const db = getDb();
  return db.select().from(schema.users).where(eq(schema.users.username, session.u)).get() ?? null;
}

export async function requireUser(): Promise<DbUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("unauthorized");
  return user;
}

export async function requireAdmin(): Promise<DbUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("forbidden");
  return user;
}
