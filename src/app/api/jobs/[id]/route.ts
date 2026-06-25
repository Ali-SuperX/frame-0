/**
 * /api/jobs/[id] — 单任务操作。
 * PATCH: 更新状态/字段
 * DELETE: 删除
 */
import { NextResponse, type NextRequest } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/db/auth-helper";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const db = getDb();
  const existing = db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, user.id)))
    .get();

  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  if (body.status !== undefined) update.status = body.status;
  if (body.taskId !== undefined) update.taskId = body.taskId;
  if (body.videoUrl !== undefined) update.videoUrl = body.videoUrl;
  if (body.errorMessage !== undefined) update.errorMessage = body.errorMessage;
  if (body.title !== undefined) update.title = body.title;
  if (body.published !== undefined) update.published = body.published ? 1 : 0;
  if (body.favorite !== undefined) update.favorite = body.favorite ? 1 : 0;
  if (body.tags !== undefined) update.tags = JSON.stringify(body.tags);
  if (body.note !== undefined) update.note = body.note;
  if (body.completedAt !== undefined) update.completedAt = body.completedAt;
  if (body.params !== undefined) update.params = JSON.stringify(body.params);
  if (body.media !== undefined) update.media = JSON.stringify(body.media);
  if (body.prompt !== undefined) update.prompt = body.prompt;

  if (Object.keys(update).length > 0) {
    db.update(schema.jobs)
      .set(update)
      .where(eq(schema.jobs.id, id))
      .run();
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  db.delete(schema.jobs)
    .where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, user.id)))
    .run();

  return NextResponse.json({ ok: true });
}
