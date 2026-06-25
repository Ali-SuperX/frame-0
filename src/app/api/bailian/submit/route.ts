import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  submitTask,
  generateImage,
  readUserKeysFromRequest,
  type SubmitInput,
} from "@/lib/bailian/client";
import { getModel } from "@/lib/bailian/models";
import {
  hashBytes,
  persistUploadBytes,
  triggerUploadOssSidecar,
} from "@/lib/bailian/uploadCache";

export const runtime = "nodejs";

/** DashScope 同步生图返回的临时签名 URL 1 小时即过期。我们立刻把字节
 *  fetch 下来镜像到 data/uploads/<sha>.<ext>，把客户端拿到的 URL 直接换成
 *  永久路径 /api/uploads/<sha>.<ext> —— 视频走 saveVideo 落盘，图片这边
 *  对齐同样语义。下载失败则透传原 URL（不阻塞主流程）。 */
async function mirrorImagesToDisk(urls: string[]): Promise<string[]> {
  return Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return url;
        const buf = Buffer.from(await res.arrayBuffer());
        const sha = hashBytes(buf);
        const ct = res.headers.get("content-type") || "image/jpeg";
        // 从 content-type 推扩展名；persistUploadBytes 会按 filename 末段
        // 截一个 ext 出来，所以这里只要构造合法 filename 即可。
        const ext = ct.includes("png")
          ? "png"
          : ct.includes("webp")
            ? "webp"
            : "jpg";
        const { ext: persistedExt, isNew } = await persistUploadBytes(
          buf,
          sha,
          `gen.${ext}`
        );
        // 镜像 DashScope 生图结果 —— 没有 putCache 时序约束,可以立即触发 sidecar
        if (isNew) triggerUploadOssSidecar(buf, sha, persistedExt);
        return `/api/uploads/${sha}.${persistedExt}`;
      } catch {
        return url; // 下载失败 → 让客户端兜底逻辑处理过期
      }
    })
  );
}

const LOCAL_UPLOAD_RE = /^\/api\/uploads\/([A-Za-z0-9._-]+)$/;

/** 本地 /api/uploads/<file> → base64 data URL。
 *  DashScope 云端 fetch 不到 localhost，参考图(角色立绘等)必须内联成 base64
 *  才能作为图生图 / 参考图输入。非本地 URL 原样返回。 */
async function inlineLocalImage(url: string): Promise<string> {
  const m = url.match(LOCAL_UPLOAD_RE);
  if (!m) return url;
  try {
    const buf = await fs.readFile(path.join(process.cwd(), "data", "uploads", m[1]));
    const ext = (m[1].split(".").pop() || "jpg").toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return url;
  }
}

/** 把 media 里所有本地图片 URL 内联成 base64（就地修改）。 */
async function inlineLocalRefs(media: SubmitInput["media"]): Promise<void> {
  if (!media) return;
  const m = media as Record<string, unknown>;
  for (const key of ["img_url", "last_frame_url", "first_clip_url"]) {
    if (typeof m[key] === "string") m[key] = await inlineLocalImage(m[key] as string);
  }
  for (const key of ["ref_images", "reference_urls"]) {
    if (Array.isArray(m[key])) m[key] = await Promise.all((m[key] as string[]).map(inlineLocalImage));
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SubmitInput;
    if (!body?.modelId) {
      return NextResponse.json({ error: "modelId required" }, { status: 400 });
    }
    await inlineLocalRefs(body.media);
    const userKeys = readUserKeysFromRequest(req);
    // Image models are synchronous — one POST returns the image URL(s) directly,
    // no async task / polling. Video models keep the task_id flow.
    if (getModel(body.modelId)?.protocol === "image") {
      const { imageUrls } = await generateImage(body, userKeys);
      const localUrls = await mirrorImagesToDisk(imageUrls);
      return NextResponse.json({ imageUrls: localUrls });
    }
    const { taskId } = await submitTask(body, userKeys);
    return NextResponse.json({ taskId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
