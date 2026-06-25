import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 报告服务端是否已配置 DASHSCOPE 主密钥 —— **只返回布尔值，绝不回传密钥本身**。
 *
 * 用途：私有部署 / 自配 `.env.local` 时，服务端已有 key，客户端不应再因
 * 「未配置 Key」误拦生成。客户端据此把 needsKey 置为 false，提交时不带用户
 * key，服务端走 env fallback。
 */
export function GET() {
  const hasServerKey = !!process.env.DASHSCOPE_API_KEY?.trim();
  return NextResponse.json({ hasServerKey });
}
