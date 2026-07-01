import { NextResponse } from "next/server";
import { uploadToOss, readUserKeysFromRequest } from "@/lib/bailian/client";
import {
  getCached,
  putCache,
  hashBytes,
  persistUploadBytes,
  triggerUploadOssSidecar,
} from "@/lib/bailian/uploadCache";
import { localUploadPath } from "@/lib/mediaPaths";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const modelName = String(form.get("model") || "wan2.7-i2v");
    if (!file) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    const userKeys = readUserKeysFromRequest(req);
    const arrayBuf = await file.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    const sha = hashBytes(buf);
    const filename = file.name || "upload.bin";

    // Always persist the upload bytes locally — survives IDB / cache clears.
    const { ext, isNew } = await persistUploadBytes(buf, sha, filename);
    const localPath = localUploadPath(sha, ext);

    // Content-hash dedup: same bytes uploaded recently → return cached oss://
    const cached = await getCached(sha);
    if (cached) {
      return NextResponse.json({ ossUrl: cached.ossUrl, localPath, cached: true, sha });
    }

    const ossUrl = await uploadToOss(buf, filename, modelName, userKeys);
    await putCache(sha, {
      ossUrl,
      modelName,
      savedAt: Date.now(),
      size: buf.length,
      filename,
      localExt: ext,
    });
    // OSS sidecar —— **必须**在 putCache 之后触发,sidecar 写回 ossSideKey 时
    // 才能命中 cache[sha]。isNew=false(同 sha 重复上传)时本地文件已存在,
    // sidecar 也已经在历史某次推过,无需再推。
    if (isNew) triggerUploadOssSidecar(buf, sha, ext);
    return NextResponse.json({ ossUrl, localPath, cached: false, sha });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
