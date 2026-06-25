/**
 * /api/jobs/import — 批量导入 jobs（从客户端 IDB 迁移用）。
 * POST: { jobs: Job[] } → 插入当前用户名下，跳过已存在的 id。
 */
import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/db/auth-helper";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: { jobs?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!Array.isArray(body.jobs)) {
    return NextResponse.json({ error: "需要 jobs 数组" }, { status: 400 });
  }

  const db = getDb();
  let imported = 0;
  let skipped = 0;

  for (const raw of body.jobs) {
    const j = raw as Record<string, unknown>;
    if (!j.id) { skipped++; continue; }

    const existing = db.select().from(schema.jobs).where(eq(schema.jobs.id, j.id as string)).get();
    if (existing) { skipped++; continue; }

    db.insert(schema.jobs).values({
      id: j.id as string,
      userId: user.id,
      modelId: (j.modelId as string) || "unknown",
      mode: (j.mode as string) || "t2v",
      status: (j.status as string) || "done",
      prompt: (j.prompt as string) || null,
      negativePrompt: (j.negativePrompt as string) || null,
      params: j.params ? JSON.stringify(j.params) : null,
      media: j.media ? JSON.stringify(j.media) : null,
      taskId: (j.taskId as string) || null,
      videoUrl: (j.videoUrl as string) || null,
      errorMessage: (j.errorMessage as string) || null,
      title: (j.title as string) || null,
      published: j.published ? 1 : 0,
      favorite: j.favorite ? 1 : 0,
      tags: Array.isArray(j.tags) ? JSON.stringify(j.tags) : null,
      note: (j.note as string) || null,
      createdAt: (j.createdAt as number) || Date.now(),
      completedAt: (j.completedAt as number) || null,
    }).run();
    imported++;
  }

  return NextResponse.json({ ok: true, imported, skipped });
}
