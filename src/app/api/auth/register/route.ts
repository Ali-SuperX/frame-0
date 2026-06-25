import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq, and, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { signToken, buildSetCookieHeader } from "@/lib/auth";
import { createOrgWithOwner } from "@/lib/db/orgs";

export const runtime = "nodejs";

const SALT_ROUNDS = 10;

/** POST { username, password, inviteCode } → 注册新用户 */
export async function POST(req: Request) {
  let body: { username?: unknown; password?: unknown; inviteCode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim() : "";

  if (!username || !password) {
    return NextResponse.json({ error: "用户名或密码不能为空" }, { status: 400 });
  }
  if (username.length < 2 || username.length > 32) {
    return NextResponse.json({ error: "用户名长度 2-32 字符" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
  }
  if (!inviteCode) {
    return NextResponse.json({ error: "需要邀请码" }, { status: 400 });
  }

  const db = getDb();

  const invite = db
    .select()
    .from(schema.inviteCodes)
    .where(and(eq(schema.inviteCodes.code, inviteCode), isNull(schema.inviteCodes.usedBy)))
    .get();

  if (!invite) {
    return NextResponse.json({ error: "邀请码无效或已使用" }, { status: 400 });
  }
  if (invite.expiresAt < Date.now()) {
    return NextResponse.json({ error: "邀请码已过期" }, { status: 400 });
  }

  const existing = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .get();

  if (existing) {
    return NextResponse.json({ error: "用户名已存在" }, { status: 409 });
  }

  const now = Date.now();
  const userId = `user_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const hash = await bcrypt.hash(password, SALT_ROUNDS);

  db.insert(schema.users).values({
    id: userId,
    username,
    passwordHash: hash,
    role: "user",
    createdAt: now,
    updatedAt: now,
  }).run();

  db.update(schema.inviteCodes)
    .set({ usedBy: userId, usedAt: now })
    .where(eq(schema.inviteCodes.code, inviteCode))
    .run();

  // 注册即建个人默认组织（多租户容器，为团队协作铺路）
  createOrgWithOwner(`${username} 的工作室`, userId);

  const token = await signToken(username);
  const res = NextResponse.json({ ok: true, user: username });
  res.headers.set("Set-Cookie", buildSetCookieHeader(token));
  return res;
}
