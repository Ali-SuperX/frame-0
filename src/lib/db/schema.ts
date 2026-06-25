/**
 * Drizzle ORM schema — frame-0 多租户数据模型。
 * SQLite (better-sqlite3) 单文件，零外部依赖。
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "user"] }).default("user").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const inviteCodes = sqliteTable("invite_codes", {
  code: text("code").primaryKey(),
  createdBy: text("created_by").notNull().references(() => users.id),
  usedBy: text("used_by").references(() => users.id),
  usedAt: integer("used_at"),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  modelId: text("model_id").notNull(),
  mode: text("mode").notNull(),
  status: text("status").notNull().default("submitting"),
  prompt: text("prompt"),
  negativePrompt: text("negative_prompt"),
  params: text("params"),
  media: text("media"),
  taskId: text("task_id"),
  videoUrl: text("video_url"),
  errorMessage: text("error_message"),
  title: text("title"),
  published: integer("published").default(0),
  favorite: integer("favorite").default(0),
  tags: text("tags"),
  note: text("note"),
  category: text("category"),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at"),
});

// ── 多租户：组织 / 成员 / 项目 ──
export const orgs = sqliteTable("orgs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  createdAt: integer("created_at").notNull(),
});

export const orgMembers = sqliteTable("org_members", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => orgs.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role", { enum: ["owner", "member"] }).default("member").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => orgs.id),
  name: text("name").notNull(),
  kind: text("kind").default("comic").notNull(),
  data: text("data"), // 整个 series 的 JSON
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type DbUser = typeof users.$inferSelect;
export type DbInviteCode = typeof inviteCodes.$inferSelect;
export type DbJob = typeof jobs.$inferSelect;
export type DbOrg = typeof orgs.$inferSelect;
export type DbOrgMember = typeof orgMembers.$inferSelect;
export type DbProject = typeof projects.$inferSelect;
