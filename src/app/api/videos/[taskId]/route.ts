import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import {
  getVideoPath,
  readVideoMeta,
  updateVideoMeta,
  type LocalVideoMeta,
} from "@/lib/bailian/localVideo";
import {
  isOssConfigured,
  ossObjectExists,
  ossVideoKey,
  signOssUrl,
} from "@/lib/storage/oss";

export const runtime = "nodejs";

/** 单个 Range 请求最多读多少字节 ——
 *  浏览器为了拿到 mp4 首帧 + moov box 通常发 `Range: bytes=0-`，希望服务器
 *  返一个合理的初始片段而不是整段文件。给 1 MiB 既够 moov 解析（多数 mp4
 *  是 64 KiB ~ 几百 KiB），又把单次响应控制在合理大小，让浏览器流畅地按需
 *  续拉后续片段。改前实现是 `fs.readFile` 整段直出，9.7 MB × 200+ 条
 *  缩略要求把 dev HTTP/1.1 6 并发塞爆，列表打开慢到秒级。 */
const DEFAULT_CHUNK = 1024 * 1024;

function parseRange(
  header: string | null,
  size: number
): { start: number; end: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d+)?-(\d+)?$/.exec(header.trim());
  if (!m) return null;
  const startStr = m[1];
  const endStr = m[2];
  // suffix range: bytes=-N → 末尾 N 字节
  if (!startStr && endStr) {
    const tail = Math.min(parseInt(endStr, 10), size);
    return { start: size - tail, end: size - 1 };
  }
  if (startStr === undefined) return null;
  const start = Math.max(0, parseInt(startStr, 10));
  const end = endStr
    ? Math.min(parseInt(endStr, 10), size - 1)
    : Math.min(start + DEFAULT_CHUNK - 1, size - 1);
  if (start > end || start >= size) return null;
  return { start, end };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const result = await getVideoPath(taskId);
  if (!result) {
    // 本地缺失 —— OSS 第四层兜底:K8s 多副本场景下其它 pod 的 data/videos 不共享,
    // 或者 PVC 出问题/被清掉时,从 OSS sidecar 拉回来。
    if (isOssConfigured()) {
      const meta = await readVideoMeta(taskId);

      // Path A · meta 里有 ossSideKey —— sidecar 推完写回了,直接 sign + redirect,
      // 省一次 head RTT。如果 OSS 那边已被人为删,浏览器会拿到 403/404,可接受。
      if (meta?.ossSideKey) {
        const url = signOssUrl(meta.ossSideKey);
        if (url) {
          return NextResponse.redirect(url, {
            status: 302,
            headers: { "Cache-Control": "public, max-age=600" },
          });
        }
      }

      // Path B · meta 缺 ossSideKey(历史数据 / sidecar 失败 / 跨副本未同步)。
      // 按 taskId 猜 mp4 / webm,head 验证存在再 sign。
      const candidates = [
        ossVideoKey(taskId, "mp4"),
        ossVideoKey(taskId, "webm"),
      ];
      for (const key of candidates) {
        const head = await ossObjectExists(key);
        if (!head) continue;
        const url = signOssUrl(key);
        if (!url) continue;
        return NextResponse.redirect(url, {
          status: 302,
          headers: { "Cache-Control": "public, max-age=600" },
        });
      }
    }
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const stat = await fs.stat(result.filePath);
  const size = stat.size;

  const baseHeaders: Record<string, string> = {
    "Content-Type": result.mime,
    "Cache-Control": "public, max-age=31536000, immutable",
    // 让浏览器/中间盒知道这个 endpoint 支持 Range —— 没这条头部分客户端
    // 会判定不支持，转为 200 整段下载。
    "Accept-Ranges": "bytes",
  };

  const range = parseRange(req.headers.get("range"), size);

  // No Range / 解析失败 → 200 整段（HEAD 也走这里），但仍只读对应字节，
  // 不再 readFile 把 9MB 一次性灌进进程内存。
  if (!range) {
    const fh = await fs.open(result.filePath, "r");
    const buf = Buffer.alloc(size);
    await fh.read(buf, 0, size, 0);
    await fh.close();
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: { ...baseHeaders, "Content-Length": String(size) },
    });
  }

  const { start, end } = range;
  const length = end - start + 1;
  const fh = await fs.open(result.filePath, "r");
  const buf = Buffer.alloc(length);
  await fh.read(buf, 0, length, start);
  await fh.close();

  return new NextResponse(new Uint8Array(buf), {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(length),
    },
  });
}

/** Patch the metadata JSON for a saved video. Used by the client to push
 *  full job context (params/media/prompt) after generation succeeds. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  let patch: Partial<LocalVideoMeta> = {};
  try {
    patch = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  await updateVideoMeta(taskId, patch);
  return NextResponse.json({ ok: true });
}
