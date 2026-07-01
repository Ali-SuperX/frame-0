/**
 * /api/canvas-projects/[id] — Canvas project read / upsert / delete.
 * Upsert accepts client-generated canvas ids so /canvas/<id> stays stable.
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/db/auth-helper";
import { isOrgMember } from "@/lib/db/orgs";
import type { DbProject } from "@/lib/db/schema";

export const runtime = "nodejs";

const CANVAS_KIND = "canvas";
const ID_RE = /^[A-Za-z0-9_-]{3,96}$/;

function validId(id: string): boolean {
  return ID_RE.test(id);
}

function parseBody(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

async function readCanvasProject(id: string): Promise<NextResponse | DbProject> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!validId(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const proj = getDb()
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, id), eq(schema.projects.kind, CANVAS_KIND)))
    .get();
  if (!proj) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  if (!isOrgMember(proj.orgId, user.id)) return NextResponse.json({ error: "无权限" }, { status: 403 });
  return proj;
}

async function upsert(req: NextRequest, id: string) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!validId(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = parseBody(await req.json()); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const db = getDb();
  const existing = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  const now = Date.now();
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "未命名画布";
  const data = body.data === undefined ? undefined : JSON.stringify(body.data);

  if (existing) {
    if (existing.kind !== CANVAS_KIND) return NextResponse.json({ error: "项目类型不匹配" }, { status: 409 });
    if (!isOrgMember(existing.orgId, user.id)) return NextResponse.json({ error: "无权限" }, { status: 403 });
    db.update(schema.projects)
      .set({
        name,
        ...(data !== undefined ? { data } : {}),
        updatedAt: now,
      })
      .where(eq(schema.projects.id, id))
      .run();
    return NextResponse.json({ ok: true, id });
  }

  const orgId = typeof body.orgId === "string" ? body.orgId : "";
  if (!orgId || !isOrgMember(orgId, user.id)) return NextResponse.json({ error: "无权限" }, { status: 403 });

  db.insert(schema.projects).values({
    id,
    orgId,
    name,
    kind: CANVAS_KIND,
    data: data ?? null,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  }).run();

  return NextResponse.json({ ok: true, id });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proj = await readCanvasProject(id);
  if (proj instanceof NextResponse) return proj;
  return NextResponse.json({ ...proj, data: proj.data ? JSON.parse(proj.data) : null });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return upsert(req, id);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return upsert(req, id);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proj = await readCanvasProject(id);
  if (proj instanceof NextResponse) return proj;
  getDb().delete(schema.projects).where(eq(schema.projects.id, id)).run();
  return NextResponse.json({ ok: true });
}
