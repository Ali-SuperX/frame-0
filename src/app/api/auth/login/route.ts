import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  signToken,
  verifyCredentials,
  buildSetCookieHeader,
} from "@/lib/auth";
import { seedAdminFromEnv } from "@/lib/db/seed";

export const runtime = "nodejs";

/** POST { username, password } → set cookie + { ok:true, user, role } */
export async function POST(req: Request) {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) {
    return NextResponse.json(
      { error: "用户名或密码不能为空" },
      { status: 400 }
    );
  }

  // 首次启动：把 .env.local 的用户迁入 DB
  await seedAdminFromEnv();

  const db = getDb();
  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .get();

  if (!user) {
    // 兜底检查旧 env 方式（平滑过渡）
    if (verifyCredentials(username, password)) {
      const token = await signToken(username);
      const res = NextResponse.json({ ok: true, user: username, role: "admin" });
      res.headers.set("Set-Cookie", buildSetCookieHeader(token));
      return res;
    }
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  const token = await signToken(username);
  const res = NextResponse.json({ ok: true, user: username, role: user.role });
  res.headers.set("Set-Cookie", buildSetCookieHeader(token));
  return res;
}
