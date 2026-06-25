/**
 * /api/bailian/preset-preview — 返回某个场景预设的详细规则内容。
 * 让客户端可点击预设卡查看明细而不把规则字符串打进 bundle。
 */

import { getPresetRule } from "@/lib/r2v/promptPresetsServer";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const presetId = searchParams.get("id");

  if (!presetId) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const rule = getPresetRule(presetId);
  if (!rule) {
    return Response.json({ error: "preset not found" }, { status: 404 });
  }

  return Response.json({
    title: rule.title,
    content: rule.content,
    fullLen: rule.content.length,
  });
}
