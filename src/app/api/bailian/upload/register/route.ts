import { NextResponse } from "next/server";
import {
  hashBytes,
  persistUploadBytes,
  putCache,
  triggerUploadOssSidecar,
} from "@/lib/bailian/uploadCache";
import { localUploadPath } from "@/lib/mediaPaths";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "multipart file required" }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("file");
    let sha = String(form.get("sha") || "");
    const ossUrl = String(form.get("ossUrl") || "");
    let filename = String(form.get("filename") || "");
    const ext = String(form.get("ext") || "");
    let size = Number(form.get("size") || 0);
    const model = String(form.get("model") || "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    filename = filename || file.name || `upload.${ext || "bin"}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const actualSha = hashBytes(buf);
    if (sha && sha !== actualSha) {
      return NextResponse.json({ error: "sha mismatch" }, { status: 400 });
    }
    sha = actualSha;
    size = buf.length;
    if (!sha || !ossUrl) {
      return NextResponse.json({ error: "sha + ossUrl required" }, { status: 400 });
    }

    const persisted = await persistUploadBytes(buf, sha, filename);
    await putCache(sha, {
      ossUrl,
      modelName: String(model || "wan2.7-i2v"),
      savedAt: Date.now(),
      size,
      filename,
      localExt: persisted.ext,
    });
    if (persisted.isNew) triggerUploadOssSidecar(buf, sha, persisted.ext);

    return NextResponse.json({
      ok: true,
      localPath: localUploadPath(sha, persisted.ext),
      mirrored: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
