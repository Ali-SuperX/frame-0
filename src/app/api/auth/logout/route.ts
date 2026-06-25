import { NextResponse } from "next/server";
import { buildClearCookieHeader } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", buildClearCookieHeader());
  return res;
}
