/** /api/orgs — 当前用户所属的组织列表。 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/db/auth-helper";
import { getUserOrgs, createOrgWithOwner } from "@/lib/db/orgs";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  let orgs = getUserOrgs(user.id);
  if (!orgs.length) {
    // 老用户（注册早于多租户）懒补默认组织，保证人人有归属
    createOrgWithOwner(`${user.username} 的工作室`, user.id);
    orgs = getUserOrgs(user.id);
  }
  return NextResponse.json(orgs);
}
