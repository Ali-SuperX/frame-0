import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth";

const intl = createMiddleware(routing);
const LOCAL_AUTH_BYPASS = process.env.NODE_ENV === "development";

/** 受保护的路由 —— 匹配 /guide / /director（及其 /en 前缀与任何子路径）。 */
const PROTECTED_RE = /^\/(?:en\/)?(?:guide|director)(?:\/.*)?$/;

export default async function middleware(req: NextRequest) {
  if (!LOCAL_AUTH_BYPASS && PROTECTED_RE.test(req.nextUrl.pathname)) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const session = await verifyToken(token);
    if (!session) {
      const url = new URL(
        `/login?from=${encodeURIComponent(
          req.nextUrl.pathname + req.nextUrl.search
        )}`,
        req.url
      );
      return NextResponse.redirect(url);
    }
  }
  return intl(req);
}

export const config = {
  // Match everything except Next internals, API routes, static files.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
