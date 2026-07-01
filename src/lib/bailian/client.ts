/**
 * Server-side Bailian (Aliyun DashScope) client.
 * DO NOT import from client components — this reads DASHSCOPE_API_KEY.
 *
 * Builds the right HTTP payload per protocol family, submits the async task,
 * exposes a poll function, and handles OSS uploads for local media files.
 */

import "server-only";
import { MODELS, getModel, type Mode, type ModelSpec } from "./models";

const DEFAULT_API_BASE = "https://dashscope.aliyuncs.com/api/v1";
const SYNTH_PATH = "/services/aigc/video-generation/video-synthesis";
const TASK_PATH = (id: string) => `/tasks/${id}`;
const UPLOAD_PATH = "/uploads";

const TASK_URL = (id: string) => `${DEFAULT_API_BASE}${TASK_PATH(id)}`;
const UPLOAD_POLICY_URL = `${DEFAULT_API_BASE}${UPLOAD_PATH}`;
/** Synchronous image generation / editing — z-image / wan-image / qwen-image. */
const IMAGE_GEN_URL = `${DEFAULT_API_BASE}/services/aigc/multimodal-generation/generation`;

function specSubmitUrl(spec: ModelSpec): string {
  return `${spec.apiBase ?? DEFAULT_API_BASE}${SYNTH_PATH}`;
}
function specTaskUrl(spec: ModelSpec, id: string): string {
  return `${spec.apiBase ?? DEFAULT_API_BASE}${TASK_PATH(id)}`;
}

/**
 * Resolve the API key for a given model spec.
 * Precedence (user-entered always wins over server env):
 *   1. userKeys[spec.apiKeyEnv]    (web-UI-entered, model-specific)
 *   2. process.env[spec.apiKeyEnv] (.env.local, model-specific)
 *   3. userKeys.DASHSCOPE_API_KEY  (web-UI-entered, main)
 *   4. process.env.DASHSCOPE_API_KEY
 *
 * Sending user keys as a same-origin header is safe — they never touch
 * Bailian directly, only our own /api/bailian/* routes.
 */
function apiKeyForSpec(
  spec?: ModelSpec,
  userKeys?: Record<string, string>
): string {
  if (spec?.apiKeyEnv) {
    const uiSpecific = userKeys?.[spec.apiKeyEnv];
    if (uiSpecific) return uiSpecific;
    const envSpecific = process.env[spec.apiKeyEnv];
    if (envSpecific) return envSpecific;
  }
  const uiMain = userKeys?.DASHSCOPE_API_KEY;
  if (uiMain) return uiMain;
  const envMain = process.env.DASHSCOPE_API_KEY;
  if (envMain) return envMain;
  const want = spec?.apiKeyEnv
    ? `${spec.apiKeyEnv} or DASHSCOPE_API_KEY`
    : "DASHSCOPE_API_KEY";
  throw new Error(`${want} is not set (fill it in Settings ⚙️ or .env.local)`);
}

/** Backwards-compat helper for call sites that don't have a spec handy. */
function apiKey(userKeys?: Record<string, string>): string {
  return apiKeyForSpec(undefined, userKeys);
}

/**
 * Parse user-entered keys from an inbound request header.
 * The client encodes its full `apiKeys` map as JSON in `x-frame-api-keys`.
 * Invalid/missing → empty object (falls back to env).
 */
export function readUserKeysFromRequest(
  req: Request
): Record<string, string> {
  const hdr = req.headers.get("x-frame-api-keys");
  if (!hdr) return {};
  try {
    const parsed = JSON.parse(hdr);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

/* ─────────── types ─────────── */

export type SubmitInput = {
  modelId: string;
  /** User-filled params keyed by ParamField.key. */
  params: Record<string, unknown>;
  /** Resolved media URLs (http(s)://, oss://, or data:). See resolveMedia. */
  media: {
    prompt?: string;
    negative_prompt?: string;
    img_url?: string;
    last_frame_url?: string;
    first_clip_url?: string;
    reference_urls?: string[];
    video_url?: string;
    ref_images?: string[];
    audio_url?: string;
  };
};

export type TaskStatus =
  | { state: "pending" }
  | { state: "running"; progress?: number }
  | { state: "done"; videoUrl: string; raw: unknown }
  | { state: "error"; message: string };

/* ─────────── request helpers ─────────── */

function asyncHeaders(
  spec?: ModelSpec,
  userKeys?: Record<string, string>
): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    Authorization: `Bearer ${apiKeyForSpec(spec, userKeys)}`,
    "X-DashScope-Async": "enable",
  };
}

function asyncHeadersWithOss(
  spec?: ModelSpec,
  userKeys?: Record<string, string>
): Record<string, string> {
  return {
    ...asyncHeaders(spec, userKeys),
    "X-DashScope-OssResourceResolve": "enable",
  };
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  payload: unknown
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    /* fallthrough */
  }
  if (!res.ok || parsed.code) {
    const msg =
      (parsed?.message as string) ||
      text?.slice(0, 400) ||
      `HTTP ${res.status}`;
    throw new Error(`DashScope error: ${msg}`);
  }
  return parsed;
}

async function getJson(
  url: string,
  headers: Record<string, string>
): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers, cache: "no-store" });
  const text = await res.text();
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (!res.ok || parsed.code) {
    const msg = (parsed?.message as string) || text?.slice(0, 400);
    throw new Error(`DashScope error: ${msg}`);
  }
  return parsed;
}

/* ─────────── OSS upload (for local files) ─────────── */

type UploadPolicy = {
  policy: string;
  signature: string;
  upload_dir: string;
  upload_host: string;
  oss_access_key_id: string;
  x_oss_object_acl: string;
  x_oss_forbid_overwrite: string;
};

/**
 * Sanitize a filename for use as an OSS object key.
 *
 * DashScope's OSS GET path does URL-decoding on object keys before lookup, but
 * the upload-time form-post stores keys as UTF-8 raw bytes. Non-ASCII chars
 * (Chinese), full-width punctuation, and spaces cause that decode/encode
 * mismatch → "OSS Resource ... not exist" on the server side.
 *
 * Fix: keep only ASCII alnum / dash / underscore in the base; preserve the
 * extension; cap length so the resulting key stays compact. The original
 * human-readable filename is still kept by the caller via JobMedia.name.
 */
function sanitizeOssFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  const rawExt = dot >= 0 && dot < name.length - 1 ? name.slice(dot + 1) : "";
  const ext = rawExt.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "bin";
  const rawBase = dot >= 0 ? name.slice(0, dot) : name;
  const safeBase =
    rawBase.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "file";
  return `${safeBase}.${ext}`;
}

export async function getUploadPolicy(
  filename: string,
  modelName: string,
  userKeys?: Record<string, string>
): Promise<{ data: UploadPolicy; safeFilename: string; key: string }> {
  const policyRes = await fetch(
    `${UPLOAD_POLICY_URL}?action=getPolicy&model=${encodeURIComponent(modelName)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey(userKeys)}`,
        "Content-Type": "application/json",
      },
    }
  );
  if (!policyRes.ok) {
    throw new Error(`OSS policy error: ${policyRes.status} ${await policyRes.text()}`);
  }
  const data = (await policyRes.json()).data as UploadPolicy;
  const safeFilename = sanitizeOssFilename(filename);
  const key = `${data.upload_dir}/${safeFilename}`;
  return { data, safeFilename, key };
}

export async function uploadToOss(
  buffer: Buffer | Uint8Array,
  filename: string,
  modelName: string,
  userKeys?: Record<string, string>
): Promise<string> {
  const { data, safeFilename, key } = await getUploadPolicy(filename, modelName, userKeys);
  const form = new FormData();
  form.append("OSSAccessKeyId", data.oss_access_key_id);
  form.append("Signature", data.signature);
  form.append("policy", data.policy);
  form.append("x-oss-object-acl", data.x_oss_object_acl);
  form.append("x-oss-forbid-overwrite", data.x_oss_forbid_overwrite);
  form.append("key", key);
  form.append("success_action_status", "200");
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  form.append(
    "file",
    new Blob([new Uint8Array(buf)]),
    safeFilename
  );

  const up = await fetch(data.upload_host, { method: "POST", body: form });
  if (!up.ok) {
    throw new Error(
      `OSS upload failed ${up.status}: ${(await up.text()).slice(0, 200)}`
    );
  }
  return `oss://${key}`;
}

/* ─────────── payload builders per protocol ─────────── */

function copyParam(
  out: Record<string, unknown>,
  params: Record<string, unknown>,
  keys: string[]
) {
  for (const k of keys) {
    const v = params[k];
    if (v === undefined || v === null || v === "") continue;
    // Numeric-looking string → number (ParamField enum may store numbers as strings)
    if (
      (k === "duration" || k === "seed") &&
      typeof v === "string" &&
      v.trim() !== "" &&
      !isNaN(Number(v))
    ) {
      out[k] = Number(v);
    } else {
      out[k] = v;
    }
  }
}

function buildPayload(
  spec: ModelSpec,
  input: SubmitInput,
  userKeys?: Record<string, string>
): { url: string; headers: Record<string, string>; body: unknown } {
  const { params, media } = input;
  const baseInput: Record<string, unknown> = {};
  const baseParams: Record<string, unknown> = {};

  if (media.prompt) baseInput.prompt = media.prompt;
  if (media.negative_prompt) baseInput.negative_prompt = media.negative_prompt;

  switch (spec.protocol) {
    case "wan27": {
      // Uses input.media[] + resolution+ratio params.
      if (spec.mode === "i2v") {
        const m: Array<{ type: string; url: string }> = [];
        // first_clip takes precedence over first_frame (video-extend mode)
        if (media.first_clip_url) {
          m.push({ type: "first_clip", url: media.first_clip_url });
        } else if (media.img_url) {
          m.push({ type: "first_frame", url: media.img_url });
        }
        // optional last_frame (first-last-frame mode or extend+last_frame)
        if (media.last_frame_url) {
          m.push({ type: "last_frame", url: media.last_frame_url });
        }
        // driving_audio — new wan2.7-i2v API supports audio as media input
        if (media.audio_url) {
          m.push({ type: "driving_audio", url: media.audio_url });
        }
        if (m.length) baseInput.media = m;
      }
      if (spec.mode === "r2v" && media.reference_urls?.length) {
        // DashScope wan27 r2v expects type === "reference_image"
        // (different from pixverse which uses "refer").
        baseInput.media = media.reference_urls.map((u) => ({
          type: "reference_image",
          url: u,
        }));
      }
      if (spec.mode === "ve") {
        // Video edit: source video + optional reference images.
        const m: Array<{ type: string; url: string }> = [];
        if (media.video_url) m.push({ type: "video", url: media.video_url });
        if (media.ref_images?.length) {
          for (const u of media.ref_images) {
            m.push({ type: "reference_image", url: u });
          }
        }
        baseInput.media = m;
      }
      // ratio 在 i2v 通常由首帧图决定；用户显式选择时一并传入让模型决定如何处理。
      const keys = ["resolution", "ratio", "duration", "prompt_extend", "watermark", "seed", "audio_url", "audio_setting"];
      copyParam(baseParams, params, keys);
      if (params.audio) baseParams.audio = true;
      // 任何带媒体输入的 wan27 任务都用 oss:// 上传 URL —— 必须让 DashScope
      // 自己去解析。t2v 不带媒体，加了头也无害。之前只对 happyhorse 加，
      // 导致 wan2.7-videoedit 实跑被预审拒（"media format is not supported
      // or incorrect for the data inspection"）。统一加上。
      const headers = asyncHeadersWithOss(spec, userKeys);
      return {
        url: specSubmitUrl(spec),
        headers,
        body: { model: spec.apiModel ?? spec.id, input: baseInput, parameters: baseParams },
      };
    }

    case "wan26": {
      // Legacy SDK-style: flat fields in input (img_url, reference_urls), size+shot_type in parameters.
      if (spec.mode === "i2v" && media.img_url) baseInput.img_url = media.img_url;
      if (spec.mode === "r2v" && media.reference_urls)
        baseInput.reference_urls = media.reference_urls;
      copyParam(baseParams, params, [
        "size",
        "resolution",
        "duration",
        "shot_type",
        "prompt_extend",
        "watermark",
        "seed",
        "audio_url",
        "negative_prompt",
      ]);
      if (params.audio) baseParams.audio = true;
      return {
        url: specSubmitUrl(spec),
        headers: asyncHeadersWithOss(spec, userKeys),
        body: { model: spec.id, input: baseInput, parameters: baseParams },
      };
    }

    case "pixverse": {
      // input.prompt + input.media; parameters include size/resolution + duration + audio.
      const m: Array<{ type: string; url: string }> = [];
      if (spec.mode === "i2v" && media.img_url)
        m.push({ type: "first_frame", url: media.img_url });
      if (spec.mode === "r2v" && media.reference_urls) {
        for (const u of media.reference_urls) m.push({ type: "refer", url: u });
      }
      if (m.length) baseInput.media = m;

      copyParam(baseParams, params, [
        "size",
        "resolution",
        "duration",
        "watermark",
        "seed",
      ]);
      baseParams.audio = Boolean(params.audio);
      // pixverse i2v also wants size derived from resolution per ref script
      if (spec.mode === "i2v" && params.resolution && !params.size) {
        const sizeMap: Record<string, string> = {
          "360P": "640*360",
          "540P": "1024*576",
          "720P": "1280*720",
          "1080P": "1920*1080",
        };
        const s = sizeMap[String(params.resolution).toUpperCase()];
        if (s) baseParams.size = s;
      }
      return {
        url: specSubmitUrl(spec),
        headers: asyncHeadersWithOss(spec, userKeys),
        body: { model: spec.id, input: baseInput, parameters: baseParams },
      };
    }

    case "kling": {
      // input.prompt + media, parameters: mode, aspect_ratio, duration, audio, watermark.
      const m: Array<{ type: string; url: string }> = [];
      if (spec.mode === "i2v" && media.img_url)
        m.push({ type: "first_frame", url: media.img_url });
      if (m.length) baseInput.media = m;

      const p: Record<string, unknown> = {};
      if (params.quality_mode) p.mode = params.quality_mode;
      if (params.ratio) p.aspect_ratio = params.ratio;
      if (params.duration) p.duration = params.duration;
      p.audio = Boolean(params.audio);
      p.watermark = Boolean(params.watermark);
      return {
        url: specSubmitUrl(spec),
        headers: asyncHeadersWithOss(spec, userKeys),
        body: { model: spec.id, input: baseInput, parameters: p },
      };
    }
  }
  throw new Error(`buildPayload: ${spec.protocol} is not an async video protocol`);
}

/* ─────────── public API ─────────── */

export async function submitTask(
  input: SubmitInput,
  userKeys?: Record<string, string>
): Promise<{ taskId: string }> {
  const spec = getModel(input.modelId);
  if (!spec) throw new Error(`Unknown model: ${input.modelId}`);
  const { url, headers, body } = buildPayload(spec, input, userKeys);
  const res = await postJson(url, headers, body);
  const taskId = (res.output as Record<string, unknown>)?.task_id as string;
  if (!taskId) {
    throw new Error(
      `Missing task_id in response: ${JSON.stringify(res).slice(0, 400)}`
    );
  }
  return { taskId };
}

/**
 * Synchronous image generation / editing (protocol "image").
 * z-image / wan2.7-image-pro / qwen-image — one POST returns image URL(s)
 * directly, no async task / polling.
 */
export async function generateImage(
  input: SubmitInput,
  userKeys?: Record<string, string>
): Promise<{ imageUrls: string[] }> {
  const spec = getModel(input.modelId);
  if (!spec) throw new Error(`Unknown model: ${input.modelId}`);
  const { params, media } = input;

  // content[] — for i2i, input images first, then the prompt text.
  const content: Array<Record<string, unknown>> = [];
  if (spec.mode === "i2i" && media.ref_images?.length) {
    for (const u of media.ref_images) content.push({ image: u });
  }
  content.push({ text: media.prompt ?? "" });

  const parameters: Record<string, unknown> = {};
  copyParam(parameters, params, ["size", "prompt_extend", "watermark", "seed"]);
  if (params.n != null && params.n !== "") parameters.n = Number(params.n);
  if (media.negative_prompt) parameters.negative_prompt = media.negative_prompt;

  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    Authorization: `Bearer ${apiKeyForSpec(spec, userKeys)}`,
  };
  // i2i input images may be oss:// — needs the OSS resolve header.
  if (spec.mode === "i2i") headers["X-DashScope-OssResourceResolve"] = "enable";

  const body = {
    model: spec.apiModel ?? spec.id,
    input: { messages: [{ role: "user", content }] },
    parameters,
  };

  const res = await postJson(IMAGE_GEN_URL, headers, body);
  const output = (res.output ?? {}) as Record<string, unknown>;
  const choices = (output.choices ?? []) as Array<Record<string, unknown>>;
  const urls: string[] = [];
  for (const ch of choices) {
    const msg = (ch.message ?? {}) as Record<string, unknown>;
    const items = (msg.content ?? []) as Array<Record<string, unknown>>;
    for (const it of items) {
      if (typeof it.image === "string") urls.push(it.image);
    }
  }
  if (!urls.length) {
    throw new Error(
      `No image in response: ${JSON.stringify(res).slice(0, 400)}`
    );
  }
  return { imageUrls: urls };
}

export async function pollTask(
  taskId: string,
  modelId?: string,
  userKeys?: Record<string, string>
): Promise<TaskStatus> {
  const spec = modelId ? getModel(modelId) : undefined;
  const url = spec ? specTaskUrl(spec, taskId) : TASK_URL(taskId);
  const res = await getJson(url, {
    Authorization: `Bearer ${apiKeyForSpec(spec, userKeys)}`,
  });
  const output = (res.output ?? {}) as Record<string, unknown>;
  const status = (output.task_status ?? "") as string;
  if (status === "SUCCEEDED") {
    const videoUrl =
      (output.video_url as string) ||
      ((output.results as Array<Record<string, string>>)?.[0]?.video_url ?? "");
    if (!videoUrl) return { state: "error", message: "No video_url in result" };
    return { state: "done", videoUrl, raw: output };
  }
  if (
    status === "FAILED" ||
    status === "CANCELED" ||
    status === "UNKNOWN"
  ) {
    const msg =
      (output.message as string) ||
      (res.message as string) ||
      `Task ${status}`;
    return { state: "error", message: msg };
  }
  if (status === "RUNNING") {
    const progress =
      typeof output.task_metrics === "object"
        ? undefined
        : undefined;
    return { state: "running", progress };
  }
  return { state: "pending" };
}

export function listModels() {
  return MODELS;
}

export const __modes: Mode[] = ["t2v", "i2v", "r2v"];
