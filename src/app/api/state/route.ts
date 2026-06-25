import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

const STATE_PATH = path.join(process.cwd(), "data", "app-state.json");

async function ensureDir() {
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
}

/** Return the disk-mirrored client state, or null if none yet. */
export async function GET() {
  try {
    const raw = await fs.readFile(STATE_PATH, "utf-8");
    return new NextResponse(raw, {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(null);
  }
}

/** Persist the full client state blob to disk. Body is the JSON string from
 *  Zustand persist (the same shape stored in localStorage). */
export async function POST(req: Request) {
  await ensureDir();
  const text = await req.text();
  // Validate it parses (don't trust the client to send non-JSON garbage).
  try { JSON.parse(text); } catch {
    return NextResponse.json({ error: "not json" }, { status: 400 });
  }
  await fs.writeFile(STATE_PATH, text);
  return NextResponse.json({ ok: true, bytes: text.length });
}
