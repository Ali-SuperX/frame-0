import { NextResponse } from "next/server";
import { getUploadPolicy, readUserKeysFromRequest } from "@/lib/bailian/client";
import { getCached, readUpload } from "@/lib/bailian/uploadCache";
import { localUploadPath } from "@/lib/mediaPaths";

export const runtime = "nodejs";

function extOf(filename: string): string {
  const m = filename.match(/\.([a-zA-Z0-9]{1,8})$/);
  return (m ? m[1] : "bin").toLowerCase();
}

export async function POST(req: Request) {
  try {
    const { sha, filename, model } = await req.json();
    if (!sha || !filename) {
      return NextResponse.json({ error: "sha + filename required" }, { status: 400 });
    }
    const modelName = String(model || "wan2.7-i2v");
    const ext = extOf(String(filename));
    const localPath = localUploadPath(String(sha), ext);

    const cached = await getCached(String(sha));
    if (cached) {
      const cachedExt = cached.localExt || ext;
      const cachedLocalPath = localUploadPath(String(sha), cachedExt);
      const localMirror = await readUpload(String(sha), cachedExt);
      return NextResponse.json({
        cached: true,
        ossUrl: cached.ossUrl,
        localPath: cachedLocalPath,
        mirrorRequired: !localMirror,
        registerRequired: true,
        ext: cachedExt,
        sha,
      });
    }

    const userKeys = readUserKeysFromRequest(req);
    const { data, safeFilename, key } = await getUploadPolicy(
      String(filename),
      modelName,
      userKeys
    );
    return NextResponse.json({
      cached: false,
      upload_host: data.upload_host,
      fields: {
        OSSAccessKeyId: data.oss_access_key_id,
        Signature: data.signature,
        policy: data.policy,
        "x-oss-object-acl": data.x_oss_object_acl,
        "x-oss-forbid-overwrite": data.x_oss_forbid_overwrite,
        key,
        success_action_status: "200",
      },
      safeFilename,
      ossUrl: `oss://${key}`,
      localPath,
      ext,
      sha,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
