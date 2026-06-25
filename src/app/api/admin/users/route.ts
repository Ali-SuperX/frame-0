/**
 * /api/admin/users — 用户管理（admin only）。
 * GET: 列出所有用户（不含密码哈希）
 */
import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/db/auth-helper";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const db = getDb();
  const users = db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      role: schema.users.role,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt))
    .all();

  // 每个用户的 job 数量
  const jobCounts = db
    .select({
      userId: schema.jobs.userId,
    })
    .from(schema.jobs)
    .all();

  const countMap = new Map<string, number>();
  for (const j of jobCounts) {
    countMap.set(j.userId, (countMap.get(j.userId) || 0) + 1);
  }

  return NextResponse.json(
    users.map((u) => ({ ...u, jobCount: countMap.get(u.id) || 0 }))
  );
}
