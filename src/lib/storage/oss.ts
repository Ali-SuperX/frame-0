/**
 * 阿里云 OSS 客户端封装（server-only）
 *
 * 用途：把用户上传 (`data/uploads/`) 和生成视频 (`data/videos/`) 持久化到
 * OSS，作为现有「thumbDataUrl / IDB / 本地镜像」三层渲染冗余之外的**第四层
 * 兜底**（同时充当多副本部署时的共享后端）。
 *
 * 设计原则：
 *   1. **单例懒加载** —— 模块首次访问时初始化；env 缺失安全降级到 null
 *   2. **零业务侵入** —— 所有方法对 client=null 都返回安全值（null/false），
 *      调用方拿到 null 当作"OSS 不可用"即可，业务逻辑不挂
 *   3. **配合既有冗余链** —— OSS 失败不影响 thumbDataUrl/IDB/本地镜像三层；
 *      OSS 接通后变成 **`/api/uploads/<sha>` 找不到本地时的 redirect 目标**
 *   4. **OSS 端 + DashScope 端分离** —— DashScope `dashscope-instant` 临时
 *      bucket（24h）是模型推理用的，本模块管理的是**用户自己的**持久 bucket，
 *      用途互不冲突
 *
 * 环境变量：
 *   OSS_ENABLED             显式总开关，必须 = "true" 才启用（默认关，避免误开产生费用）
 *   OSS_REGION              区域，默认 oss-cn-hangzhou（与百炼 cn-hangzhou 同区，回源最快）
 *   OSS_BUCKET              bucket 名（启用时必填）
 *   OSS_ACCESS_KEY_ID       AccessKey ID（启用时必填）
 *   OSS_ACCESS_KEY_SECRET   AccessKey Secret（启用时必填）
 *   OSS_KEY_PREFIX          可选 key 前缀，用于隔离环境，如 "prod/" "staging/"
 *
 * 启用流程（运维侧）：
 *   1. 阿里云开 OSS bucket + 创建 AK/SK（详见 deploy/README.md 第九节）
 *   2. OSS_ENABLED=true
 *   3. 填 OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET
 *   4. 重启服务，看 server log 有 `[oss] initialized` 一行即生效
 */

import "server-only";
import OSS from "ali-oss";

/** 总开关：默认 false，避免运维不小心填了 AK/SK 就自动产生 OSS 流量/存储费 */
const ENABLED = process.env.OSS_ENABLED === "true";
const REGION = process.env.OSS_REGION || "oss-cn-hangzhou";
const BUCKET = process.env.OSS_BUCKET || "";
const AK = process.env.OSS_ACCESS_KEY_ID || "";
const SK = process.env.OSS_ACCESS_KEY_SECRET || "";
/** 可选前缀（结尾应带 "/"），用于在同一 bucket 隔离 prod / staging / dev */
const KEY_PREFIX = process.env.OSS_KEY_PREFIX || "";

/** 默认签名 URL 有效期 = 7 天。浏览器侧拿到后通常会被 Cache-Control 缓存到
 *  下次请求；调用方需要在到期前主动续签（推荐到期前 1 天） */
export const DEFAULT_SIGN_EXPIRES_SEC = 7 * 24 * 3600;

/** undefined = 没初始化过；null = 配置缺失，永久降级；OSS = 正常 */
let _client: OSS | null | undefined;

function getOssClient(): OSS | null {
  if (_client !== undefined) return _client;
  // 显式总开关 —— 默认关。即使下面 AK/SK 填齐也不会启用,需要显式 OSS_ENABLED=true
  if (!ENABLED) {
    console.info("[oss] disabled (OSS_ENABLED ≠ 'true') — 上传/视频走本地,不会产生 OSS 费用");
    _client = null;
    return null;
  }
  if (!BUCKET || !AK || !SK) {
    console.warn(
      "[oss] OSS_ENABLED=true 但凭证不完整 — 缺 OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET,降级到关闭",
    );
    _client = null;
    return null;
  }
  try {
    _client = new OSS({
      region: REGION,
      accessKeyId: AK,
      accessKeySecret: SK,
      bucket: BUCKET,
      secure: true,
    });
    console.info(
      `[oss] initialized — region=${REGION} bucket=${BUCKET} prefix=${KEY_PREFIX || "(none)"}`,
    );
  } catch (err) {
    console.error("[oss] init failed:", err);
    _client = null;
  }
  return _client;
}

/** 给 key 拼接 prefix。传入的 key 应该是不带前缀的逻辑名（如 `uploads/abc.png`） */
function withPrefix(key: string): string {
  return KEY_PREFIX + key.replace(/^\/+/, "");
}

/** 配置健康检查 —— 用于 admin / health endpoint 探活；同时检查总开关 + 凭证 */
export function isOssConfigured(): boolean {
  return ENABLED && !!(BUCKET && AK && SK);
}

/**
 * 上传字节到 OSS。
 * @returns 成功 → 与输入对齐的 logical key（不含 prefix，与 ossUploadKey / ossVideoKey
 *          的输出一致）；OSS 未配置 / 上传失败 → null
 *
 * 设计：返回 logical key 而非 fullKey，与 `signOssUrl` / `ossObjectExists` /
 * `deleteOssObject` 的输入约定保持一致。调用方拿到返回值后存进 `ossSideKey` 字段，
 * 再传回这些读取函数时不会被 `withPrefix` 二次拼接导致路径变成 `prod/prod/...`。
 */
export async function putOssObject(
  key: string,
  data: Buffer | Uint8Array,
  mime?: string,
): Promise<string | null> {
  const client = getOssClient();
  if (!client) return null;
  const fullKey = withPrefix(key);
  try {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const opts: OSS.PutObjectOptions = mime
      ? { mime, headers: { "Content-Type": mime } }
      : {};
    await client.put(fullKey, buf, opts);
    return key;
  } catch (err) {
    console.error(`[oss] put failed for ${fullKey}:`, err);
    return null;
  }
}

/**
 * 拿一个供浏览器 redirect / DashScope fetch 的 HTTPS 签名 URL。
 *
 * @param key         不带 prefix 的逻辑名
 * @param expiresSec  有效期（秒），默认 7 天。
 *                    给浏览器渲染：用默认 7 天（配合长 Cache-Control 减少续签）
 *                    给 DashScope 一次性 fetch：可以用短期（如 1 小时）更安全
 * @returns OSS 未配置时返回 null
 */
export function signOssUrl(
  key: string,
  expiresSec: number = DEFAULT_SIGN_EXPIRES_SEC,
): string | null {
  const client = getOssClient();
  if (!client) return null;
  try {
    return client.signatureUrl(withPrefix(key), {
      expires: expiresSec,
      method: "GET",
    });
  } catch (err) {
    console.error(`[oss] sign failed for ${key}:`, err);
    return null;
  }
}

/**
 * 检查对象在 OSS 上是否存在。
 * @returns 存在 → { size, mime }；不存在 / 未配置 / 出错 → null
 */
export async function ossObjectExists(
  key: string,
): Promise<{ size: number; mime?: string } | null> {
  const client = getOssClient();
  if (!client) return null;
  try {
    const res = await client.head(withPrefix(key));
    const headers = (res.res?.headers as Record<string, string>) || {};
    const size = parseInt(headers["content-length"] || "0", 10);
    const mime = headers["content-type"];
    return { size, mime };
  } catch (err) {
    // 404 走 NoSuchKey；其他错误也 fall through 当作不存在
    const code = (err as { code?: string })?.code;
    if (code !== "NoSuchKey" && code !== "NotFound") {
      console.error(`[oss] head failed for ${key}:`, err);
    }
    return null;
  }
}

/** 删除对象。不存在 / 未配置 都返回 false，不抛错 */
export async function deleteOssObject(key: string): Promise<boolean> {
  const client = getOssClient();
  if (!client) return false;
  try {
    await client.delete(withPrefix(key));
    return true;
  } catch (err) {
    console.error(`[oss] delete failed for ${key}:`, err);
    return false;
  }
}

/**
 * 探活 —— 调一次 list 验证 bucket 可访问 + 凭证有效。
 * 用于部署后第一次确认 OSS 配置对了，或集成进 /api/health 的扩展检查。
 */
export async function pingOss(): Promise<{ ok: boolean; detail?: string }> {
  if (!isOssConfigured()) {
    return {
      ok: false,
      detail:
        "未配置 OSS —— 缺 OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET",
    };
  }
  const client = getOssClient();
  if (!client) return { ok: false, detail: "init 失败（看 server log）" };
  try {
    await client.list(
      {
        "max-keys": 1,
        prefix: KEY_PREFIX || undefined,
      },
      {},
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

/* ─── 约定俗成的 key 命名（让上传/视频两条线 key 不互相干扰） ───────── */

/** uploads 用 sha+ext，和现有 uploadCache 的本地路径保持同步 */
export function ossUploadKey(sha: string, ext: string): string {
  return `uploads/${sha}.${ext}`;
}

/** videos 用 taskId，和现有 localVideo 的本地路径保持同步 */
export function ossVideoKey(taskId: string, ext = "mp4"): string {
  return `videos/${taskId}.${ext}`;
}
