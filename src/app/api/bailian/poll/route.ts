import { NextResponse } from "next/server";
import { pollTask, readUserKeysFromRequest } from "@/lib/bailian/client";
import { saveVideo } from "@/lib/bailian/localVideo";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const taskId = url.searchParams.get("task_id");
  const modelId = url.searchParams.get("model_id") || undefined;
  if (!taskId) {
    return NextResponse.json({ error: "task_id required" }, { status: 400 });
  }
  try {
    const userKeys = readUserKeysFromRequest(req);
    const status = await pollTask(taskId, modelId, userKeys);
    if (status.state === "done") {
      try {
        const { localPath } = await saveVideo(taskId, status.videoUrl, {
          modelId,
        });
        return NextResponse.json({ ...status, localPath });
      } catch {
        // download failed — still return the OSS URL
      }
    }
    return NextResponse.json(status);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
