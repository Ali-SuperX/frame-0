/**
 * /api/projects/[id] — 单项目读写删（成员校验隔离）。
 * GET: 取 series data
 * PUT { data?, name?, kind? }: 存
 * DELETE: 删
 */
import { NextResponse, type NextRequest } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/db/auth-helper";
import { isOrgMember } from "@/lib/db/orgs";
import type { DbProject } from "@/lib/db/schema";

export const runtime = "nodejs";

/** 成功返回项目行，失败返回错误响应。 */
async function authorize(id: string): Promise<NextResponse | DbProject> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const proj = getDb().select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  if (!proj) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  if (!isOrgMember(proj.orgId, user.id)) return NextResponse.json({ error: "无权限" }, { status: 403 });
  return proj;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authorize(id);
  if (a instanceof NextResponse) return a;
  return NextResponse.json({ ...a, data: a.data ? JSON.parse(a.data) : null });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authorize(id);
  if (a instanceof NextResponse) return a;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if (body.data !== undefined) patch.data = JSON.stringify(body.data);
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.kind === "string") patch.kind = body.kind;

  getDb().update(schema.projects).set(patch).where(eq(schema.projects.id, id)).run();
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authorize(id);
  if (a instanceof NextResponse) return a;
  getDb().delete(schema.projects).where(eq(schema.projects.id, id)).run();
  return NextResponse.json({ ok: true });
}
