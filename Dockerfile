# syntax=docker/dockerfile:1.7
# ────────────────────────────────────────────────────────────────────
# Frame/0 Studio · 多阶段镜像
#   base    : 共享基础（node:22-alpine + pnpm@10.5.2）
#   deps    : 装依赖（缓存友好——源码变了不重新装包）
#   builder : 跑 next build → 产出 .next/standalone（极简自包含 server）
#   runner  : 运行镜像（≈ 200MB，只带 standalone + static + public）
# 项目 next.config.ts 已开 `output: "standalone"`，本 Dockerfile 配合它工作。
# ────────────────────────────────────────────────────────────────────

FROM node:22-alpine AS base
WORKDIR /app
# corepack 锁 pnpm 版本，和本地 pnpm-lock.yaml 兼容
RUN corepack enable && corepack prepare pnpm@10.5.2 --activate

# ────── deps：纯依赖层 ──────
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline

# ────── builder：编译 next ──────
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ────── runner：最终运行镜像 ──────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# 非 root 运行（安全 baseline）
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

# Next standalone 只需这三份产物即可跑起 server
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# /app/data 是运行时持久化（app-state.json / upload-cache.json / uploads/ / videos/）
# 必须挂卷，否则容器重启所有用户数据丢失
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data
VOLUME ["/app/data"]

USER nextjs
EXPOSE 3000

# Node 22 自带 fetch，无需装 curl/wget
# 用 /api/health 而非 / —— 轻量 JSON 响应，不渲染整个首页 + force-dynamic 绕开缓存
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
