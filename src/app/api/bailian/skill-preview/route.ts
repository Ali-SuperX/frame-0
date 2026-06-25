/**
 * /api/bailian/skill-preview — Return a skill module's content preview.
 * Keeps the 57KB knowledge base server-side while allowing UI previews.
 */

import { getModulePreview } from "@/lib/r2v/chatSystemPromptServer";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const moduleId = searchParams.get("id");

  if (!moduleId) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const preview = getModulePreview(moduleId);
  if (!preview) {
    return Response.json({ error: "module not found" }, { status: 404 });
  }

  return Response.json(preview);
}
