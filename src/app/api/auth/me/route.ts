import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { seedAdminFromEnv } from "@/lib/db/seed";

export const runtime = "nodejs";

/** GET → 401 / { user, role, userId } */
export async function GET() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const session = await verifyToken(token);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await seedAdminFromEnv();

  const db = getDb();
  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, session.u))
    .get();

  return NextResponse.json({
    user: session.u,
    role: user?.role ?? "user",
    userId: user?.id,
  });
}
