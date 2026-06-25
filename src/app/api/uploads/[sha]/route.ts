import { NextResponse } from "next/server";
import { getCached, readUpload } from "@/lib/bailian/uploadCache";
import {
  isOssConfigured,
  ossObjectExists,
  ossUploadKey,
  signOssUrl,
} from "@/lib/storage/oss";

export const runtime = "nodejs";

/** 把 signed URL 包成 302 + 短缓存。OSS 签名默认 7 天有效,这里给浏览器 10 分钟
 *  redirect 缓存,目的是缩短"用户已经在新副本/新签名"的暴露窗口。 */
function redirectToSignedUrl(url: string) {
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "public, max-age=600" },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sha: string }> }
) {
  const { sha } = await params;
  // Filename comes in as "<sha>.<ext>" — split.
  const m = sha.match(/^([a-f0-9]+)\.([a-zA-Z0-9]{1,8})$/);
  if (!m) {
    return NextResponse.json({ error: "bad name" }, { status: 400 });
  }
  const result = await readUpload(m[1], m[2]);
  if (result) {
    // Wrap in Blob — universally accepted by NextResponse without TS friction.
    const blob = new Blob([new Uint8Array(result.buf)], { type: result.mime });
    return new NextResponse(blob, {
      headers: {
        "Content-Type": result.mime,
        "Content-Length": String(result.buf.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  // 本地缺失 —— OSS 第四层兜底:K8s 多副本场景下其它 pod 的 data/uploads 不共享,
  // 或者 PVC 出问题/被清掉时,从 OSS sidecar 拉回来。
  if (isOssConfigured()) {
    // Path A · cache 里有 ossSideKey —— sidecar 已成功推过,直接 sign + redirect
    // 信任 cache,省一次 RTT(head)。如果 OSS 那边已经被人为删了,浏览器会拿到
    // 403/404,这是边缘情况,可接受。
    const cached = await getCached(m[1]);
    if (cached?.ossSideKey) {
      const url = signOssUrl(cached.ossSideKey);
      if (url) return redirectToSignedUrl(url);
    }

    // Path B · cache 缺(常见:历史数据 / 跨副本未同步 / sidecar 未触发)。
    // 按 URL 里的 sha+ext 猜 ossUploadKey,先 head 确认存在再 sign,避免给浏览器
    // 一个指向 404 的 redirect。
    const key = ossUploadKey(m[1], m[2]);
    const head = await ossObjectExists(key);
    if (head) {
      const url = signOssUrl(key);
      if (url) return redirectToSignedUrl(url);
    }
  }

  return NextResponse.json({ error: "not found" }, { status: 404 });
}
