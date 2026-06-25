/**
 * /api/projects — 多租户项目 CRUD（按组织隔离）。
 * GET ?orgId= : 该组织的项目列表（仅元数据）
 * POST { orgId, name, kind, data? } : 建项目
 */
import { NextResponse, type NextRequest } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/db/auth-helper";
import { isOrgMember } from "@/lib/db/orgs";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "缺少 orgId" }, { status: 400 });
  if (!isOrgMember(orgId, user.id)) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const rows = getDb()
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      kind: schema.projects.kind,
      createdAt: schema.projects.createdAt,
      updatedAt: schema.projects.updatedAt,
    })
    .from(schema.projects)
    .where(eq(schema.projects.orgId, orgId))
    .orderBy(desc(schema.projects.updatedAt))
    .all();

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const orgId = String(body.orgId || "");
  if (!orgId || !isOrgMember(orgId, user.id)) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const id = `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  getDb().insert(schema.projects).values({
    id,
    orgId,
    name: String(body.name || "未命名项目"),
    kind: String(body.kind || "comic"),
    data: body.data ? JSON.stringify(body.data) : null,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  }).run();

  return NextResponse.json({ ok: true, id });
}
