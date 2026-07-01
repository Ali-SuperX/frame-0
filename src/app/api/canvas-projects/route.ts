/**
 * /api/canvas-projects — Canvas-only project listing.
 * Uses the shared projects table with kind="canvas" so existing stage/drama
 * project flows keep their own data surface.
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
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
      createdAt: schema.projects.createdAt,
      updatedAt: schema.projects.updatedAt,
    })
    .from(schema.projects)
    .where(and(eq(schema.projects.orgId, orgId), eq(schema.projects.kind, "canvas")))
    .orderBy(desc(schema.projects.updatedAt))
    .all();

  return NextResponse.json(rows);
}
