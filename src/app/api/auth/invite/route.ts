import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, schema } from "@/lib/db";
import { eq, isNull, desc } from "drizzle-orm";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth";

export const runtime = "nodejs";

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function getAdmin(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const session = await verifyToken(token);
  if (!session) return null;

  const db = getDb();
  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, session.u))
    .get();

  if (!user || user.role !== "admin") return null;
  return user.id;
}

/** GET — 列出所有邀请码（admin only） */
export async function GET() {
  const adminId = await getAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const db = getDb();
  const codes = db
    .select()
    .from(schema.inviteCodes)
    .orderBy(desc(schema.inviteCodes.createdAt))
    .all();

  return NextResponse.json(codes);
}

/** POST — 生成新邀请码（admin only） */
export async function POST(req: Request) {
  const adminId = await getAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  let body: { count?: number; expiresDays?: number } = {};
  try {
    body = await req.json();
  } catch { /* default values */ }

  const count = Math.min(body.count ?? 1, 20);
  const expiresDays = body.expiresDays ?? 7;
  const now = Date.now();
  const expiresAt = now + expiresDays * 24 * 60 * 60 * 1000;

  const db = getDb();
  const created: string[] = [];

  for (let i = 0; i < count; i++) {
    const code = genCode();
    db.insert(schema.inviteCodes).values({
      code,
      createdBy: adminId,
      expiresAt,
      createdAt: now,
    }).run();
    created.push(code);
  }

  return NextResponse.json({ ok: true, codes: created, expiresAt });
}
