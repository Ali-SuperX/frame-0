import { NextResponse } from "next/server";
import { listLocalVideos } from "@/lib/bailian/localVideo";

export const runtime = "nodejs";

export async function GET() {
  const videos = await listLocalVideos();
  return NextResponse.json(videos);
}
