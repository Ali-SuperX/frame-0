/**
 * /api/jobs — 多租户 Jobs CRUD。
 * GET: 当前用户的所有 jobs
 * POST: 创建新 job（绑定当前用户）
 */
import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/db/auth-helper";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const db = getDb();
  const rows = db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.userId, user.id))
    .orderBy(desc(schema.jobs.createdAt))
    .all();

  const jobs = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    modelId: r.modelId,
    mode: r.mode,
    status: r.status,
    prompt: r.prompt,
    negativePrompt: r.negativePrompt,
    params: r.params ? JSON.parse(r.params) : {},
    media: r.media ? JSON.parse(r.media) : {},
    taskId: r.taskId,
    videoUrl: r.videoUrl,
    errorMessage: r.errorMessage,
    title: r.title,
    published: !!r.published,
    favorite: !!r.favorite,
    tags: r.tags ? JSON.parse(r.tags) : [],
    note: r.note,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
  }));

  return NextResponse.json(jobs);
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const id = (body.id as string) || `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();

  const db = getDb();
  db.insert(schema.jobs).values({
    id,
    userId: user.id,
    modelId: (body.modelId as string) || "unknown",
    mode: (body.mode as string) || "t2v",
    status: (body.status as string) || "submitting",
    prompt: (body.prompt as string) || null,
    negativePrompt: (body.negativePrompt as string) || null,
    params: body.params ? JSON.stringify(body.params) : null,
    media: body.media ? JSON.stringify(body.media) : null,
    taskId: (body.taskId as string) || null,
    videoUrl: (body.videoUrl as string) || null,
    errorMessage: (body.errorMessage as string) || null,
    title: (body.title as string) || null,
    published: body.published ? 1 : 0,
    favorite: body.favorite ? 1 : 0,
    tags: body.tags ? JSON.stringify(body.tags) : null,
    note: (body.note as string) || null,
    createdAt: (body.createdAt as number) || now,
    completedAt: (body.completedAt as number) || null,
  }).run();

  return NextResponse.json({ ok: true, id });
}
