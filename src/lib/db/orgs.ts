/** 组织 / 成员 helper —— register + orgs/projects API 复用。 */
import { getDb, schema } from "./index";
import { and, eq } from "drizzle-orm";

function genId(p: string) {
  return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 建组织 + owner 成员，返回 orgId。 */
export function createOrgWithOwner(name: string, ownerId: string): string {
  const db = getDb();
  const now = Date.now();
  const orgId = genId("org");
  db.insert(schema.orgs).values({ id: orgId, name, ownerId, createdAt: now }).run();
  db.insert(schema.orgMembers).values({ id: genId("om"), orgId, userId: ownerId, role: "owner", createdAt: now }).run();
  return orgId;
}

/** 当前用户所属的组织列表。 */
export function getUserOrgs(userId: string) {
  return getDb()
    .select({ id: schema.orgs.id, name: schema.orgs.name, ownerId: schema.orgs.ownerId, createdAt: schema.orgs.createdAt })
    .from(schema.orgMembers)
    .innerJoin(schema.orgs, eq(schema.orgMembers.orgId, schema.orgs.id))
    .where(eq(schema.orgMembers.userId, userId))
    .all();
}

/** 用户是否为组织成员（隔离校验）。 */
export function isOrgMember(orgId: string, userId: string): boolean {
  return !!getDb()
    .select({ id: schema.orgMembers.id })
    .from(schema.orgMembers)
    .where(and(eq(schema.orgMembers.orgId, orgId), eq(schema.orgMembers.userId, userId)))
    .get();
}
