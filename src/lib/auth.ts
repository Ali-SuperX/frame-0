/**
 * 极简鉴权 —— 多账号、密码登录、HMAC-SHA256 签发 cookie token。
 *
 * 设计目标：
 *   - 零外部依赖（仅 Web Crypto API + Node `next/headers`），bundle 不胀
 *   - Edge runtime 兼容（middleware 必须）
 *   - 14 天 cookie 持久会话，AUTH_SECRET 不变 token 跨重启仍有效
 *
 * 用户表：`.env.local` 的 AUTH_USERS（JSON 数组，元素 {u, p}）
 * 签发密钥：`.env.local` 的 AUTH_SECRET（建议 openssl rand -hex 32）
 *
 * Token 格式：`<b64u(payload)>.<b64u(hmacSig)>`，payload = {"u": string, "exp": number(秒)}
 */

export const SESSION_COOKIE = "frame0_session";
const DEFAULT_TTL_SEC = 14 * 24 * 60 * 60; // 14 days

export interface AuthUser {
  /** username */
  u: string;
  /** plain-text password (small-team trade-off; document in plan) */
  p: string;
}

export interface SessionPayload {
  u: string;
  exp: number;
}

/** Parse AUTH_USERS env — return [] on missing/invalid */
export function parseUsers(): AuthUser[] {
  const raw = process.env.AUTH_USERS;
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (x): x is AuthUser =>
        typeof x === "object" &&
        x !== null &&
        typeof x.u === "string" &&
        typeof x.p === "string"
    );
  } catch {
    return [];
  }
}

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s)
    throw new Error(
      "AUTH_SECRET is not set — put a 64-char hex string in .env.local"
    );
  return s;
}

/* ─────────── Web Crypto HMAC-SHA256 ─────────── */

const enc = new TextEncoder();

function b64urlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSha256(secret: string, msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return new Uint8Array(sig);
}

/** 常量时间字节比较 —— 防 timing attack */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

/** 签发 14 天 cookie token */
export async function signToken(
  username: string,
  ttlSec: number = DEFAULT_TTL_SEC
): Promise<string> {
  const payload: SessionPayload = {
    u: username,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const payloadStr = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const sig = await hmacSha256(getSecret(), payloadStr);
  return `${payloadStr}.${b64urlEncode(sig)}`;
}

/** 验签 + 检查 exp，通过返回 payload，否则 null */
export async function verifyToken(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payloadStr = token.slice(0, dot);
  const sigStr = token.slice(dot + 1);
  let expected: Uint8Array;
  try {
    expected = await hmacSha256(getSecret(), payloadStr);
  } catch {
    return null;
  }
  let actual: Uint8Array;
  try {
    actual = b64urlDecode(sigStr);
  } catch {
    return null;
  }
  if (!constantTimeEqual(expected, actual)) return null;

  let payload: SessionPayload;
  try {
    const json = new TextDecoder().decode(b64urlDecode(payloadStr));
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof payload?.u !== "string" || typeof payload?.exp !== "number")
    return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/** 验密码 —— 常量时间比较 */
export function verifyCredentials(
  username: string,
  password: string
): boolean {
  if (!username || !password) return false;
  const users = parseUsers();
  for (const u of users) {
    if (u.u !== username) continue;
    // 长度不同先填等长再比，避免泄露长度
    const a = enc.encode(u.p);
    const b = enc.encode(password);
    if (a.length !== b.length) {
      // 仍走一次 HMAC 浪费时间，让响应时间稳定
      void hmacSha256(getSecret(), password);
      return false;
    }
    return constantTimeEqual(a, b);
  }
  // 不存在的用户也走一次 HMAC，避免泄露"用户存在与否"
  void hmacSha256(getSecret(), password);
  return false;
}

/* ─────────── cookie attributes helpers ─────────── */

/** Set-Cookie 字符串值（生产 https → Secure）。Lax 防 CSRF 同时允许跳转登录回流。 */
export function buildSetCookieHeader(
  token: string,
  maxAgeSec: number = DEFAULT_TTL_SEC
): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function buildClearCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
