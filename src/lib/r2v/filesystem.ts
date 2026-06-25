/**
 * R2V Project Workspace — File System Access bridge.
 *
 * The workspace lives in a user-chosen local directory (default suggestion:
 * `~/Documents/frame-0-projects`). Each project gets its own subfolder
 * containing:
 *
 *   <project-id>/
 *     input.json       ← frame-0 writes
 *     prompt.md        ← agent (Claude Code) writes back
 *     videos/          ← downloaded video outputs (created on first generate)
 *
 * frame-0 ↔ agent communication is purely file-based, zero copy-paste:
 *   1. Card 1 saves on every edit → input.json updated.
 *   2. Card 2 polls prompt.md mtime; when it changes we reload + parse.
 *   3. Card 3 writes video-NNN.mp4 next to prompt.md after each generate.
 *
 * File System Access API support: Chromium-only (Chrome / Edge / Arc / Brave).
 * On unsupported browsers `isSupported()` returns false; the UI falls back to
 * a download / manual-load mode.
 */

import {
  R2VProjectInput,
  R2VProjectInputSchema,
  R2VPromptOutput,
} from "./schema";

/* ─────────── feature detection ─────────── */

export function isFsaSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "showDirectoryPicker" in window &&
    typeof (window as unknown as { showDirectoryPicker?: unknown })
      .showDirectoryPicker === "function"
  );
}

/* ─────────── permission helpers ─────────── */

type Permission = "granted" | "denied" | "prompt";

async function ensureRwPermission(
  handle: FileSystemDirectoryHandle,
  prompt = false
): Promise<Permission> {
  // The FileSystemHandle.queryPermission/requestPermission methods are not
  // in the lib.dom typings yet; cast through.
  const h = handle as unknown as {
    queryPermission: (opts: { mode: "readwrite" }) => Promise<Permission>;
    requestPermission: (opts: { mode: "readwrite" }) => Promise<Permission>;
  };
  const status = await h.queryPermission({ mode: "readwrite" });
  if (status === "granted") return "granted";
  if (!prompt) return status;
  return h.requestPermission({ mode: "readwrite" });
}

/* ─────────── pick / verify root ─────────── */

export async function pickRootDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!isFsaSupported()) {
    throw new Error("File System Access API unsupported on this browser");
  }
  const w = window as unknown as {
    showDirectoryPicker: (opts?: {
      id?: string;
      mode?: "read" | "readwrite";
      startIn?: string;
    }) => Promise<FileSystemDirectoryHandle>;
  };
  return w.showDirectoryPicker({
    id: "frame-0-r2v-projects",
    mode: "readwrite",
    startIn: "documents",
  });
}

export async function verifyRoot(
  handle: FileSystemDirectoryHandle
): Promise<{ ok: true } | { ok: false; reason: "denied" | "lost" | "prompt" }> {
  try {
    const status = await ensureRwPermission(handle, false);
    if (status === "granted") return { ok: true };
    return { ok: false, reason: status === "denied" ? "denied" : "prompt" };
  } catch {
    return { ok: false, reason: "lost" };
  }
}

/** Re-prompts for permission if we have a handle but lost RW access. */
export async function reauthorizeRoot(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    const status = await ensureRwPermission(handle, true);
    return status === "granted";
  } catch {
    return false;
  }
}

/* ─────────── per-project handles ─────────── */

export async function ensureProjectDir(
  root: FileSystemDirectoryHandle,
  projectId: string
): Promise<FileSystemDirectoryHandle> {
  return root.getDirectoryHandle(projectId, { create: true });
}

export async function listProjectIds(
  root: FileSystemDirectoryHandle
): Promise<string[]> {
  const ids: string[] = [];
  // FileSystemDirectoryHandle is async-iterable in Chromium.
  const iterable = root as unknown as AsyncIterable<
    [string, FileSystemHandle]
  >;
  for await (const [name, h] of iterable) {
    if (h.kind === "directory") ids.push(name);
  }
  return ids.sort().reverse();
}

/* ─────────── input.json ─────────── */

const INPUT_FILE = "input.json";
const PROMPT_FILE = "prompt.md";

/**
 * 🔒 PERSISTENCE CONTRACT FOR input.json
 * ─────────────────────────────────────────────────────────────────
 * 该函数将 R2VProjectInput 序列化为 input.json，**不剥离任何字段**。
 *
 * 规则：schema 即契约。R2VProjectInputSchema 里的每个字段都会写入磁盘。
 * 如果未来需要排除字段，从 schema 中移除而不是在这里 strip。
 *
 * 历史教训：旧版本把 thumbDataUrl/localKey 注释为 "UI-only" 然后 strip，
 * 导致刷新后所有图片预览丢失。绝不重蹈覆辙。
 */
export async function writeInput(
  root: FileSystemDirectoryHandle,
  input: R2VProjectInput
): Promise<void> {
  const dir = await ensureProjectDir(root, input.projectId);
  const file = await dir.getFileHandle(INPUT_FILE, { create: true });
  const writable = await file.createWritable();
  await writable.write(JSON.stringify(input, null, 2));
  await writable.close();
}

export async function readInput(
  root: FileSystemDirectoryHandle,
  projectId: string
): Promise<R2VProjectInput | null> {
  try {
    const dir = await root.getDirectoryHandle(projectId, { create: false });
    const fh = await dir.getFileHandle(INPUT_FILE, { create: false });
    const file = await fh.getFile();
    const text = await file.text();
    const json = JSON.parse(text);
    const parsed = R2VProjectInputSchema.parse(json);
    // 自检：发现 refs 有 url 但全部预览字段缺失时，提示用户数据可能被旧版 strip 过。
    auditPreviewIntegrity(parsed, projectId);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 在控制台报告"持久化完整性损坏"——帮助快速定位老项目数据被旧版本 strip 的情况。
 * 不抛错、不修改数据，只观测。
 */
function auditPreviewIntegrity(input: R2VProjectInput, projectId: string): void {
  if (typeof console === "undefined") return;
  const broken = input.references.filter(
    (r) => r.url && !r.thumbDataUrl && !r.localKey && !r.localPath
  );
  if (broken.length > 0) {
    console.warn(
      `[r2v] ⚠ Project "${projectId}" has ${broken.length} ref(s) with no preview data ` +
      `(thumbDataUrl/localKey/localPath all missing). This usually means the project was saved ` +
      `by an older version that stripped these fields. Re-upload to restore previews.`,
      broken.map((r) => ({ slot: r.slot, url: r.url, name: r.name }))
    );
  }
}

/* ─────────── prompt.md (frontmatter + body) ─────────── */

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;

/**
 * Tiny YAML-frontmatter parser for the subset we emit. Avoids pulling in a
 * full YAML lib for this single use case. Supports:
 *   key: value                  (string)
 *   key: |                      (literal block, indented 2 sp)
 *     line1
 *     line2
 */
function parseFrontmatter(text: string): {
  meta: Record<string, string>;
  body: string;
} {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) return { meta: {}, body: text.trim() };
  const [, fmText, body] = m;
  const meta: Record<string, string> = {};
  const lines = fmText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, raw] = kv;
    if (raw.trim() === "|") {
      const block: string[] = [];
      while (i + 1 < lines.length && /^\s{2,}/.test(lines[i + 1])) {
        i += 1;
        block.push(lines[i].replace(/^\s{2}/, ""));
      }
      meta[key] = block.join("\n");
    } else {
      meta[key] = raw.trim().replace(/^["']|["']$/g, "");
    }
  }
  return { meta, body: body.trim() };
}

export async function readPrompt(
  root: FileSystemDirectoryHandle,
  projectId: string
): Promise<{ output: R2VPromptOutput; mtime: number } | null> {
  try {
    const dir = await root.getDirectoryHandle(projectId, { create: false });
    const fh = await dir.getFileHandle(PROMPT_FILE, { create: false });
    const file = await fh.getFile();
    const text = await file.text();
    const { meta, body } = parseFrontmatter(text);
    if (!body) return null;
    return {
      output: {
        projectId: meta.projectId || projectId,
        model: meta.model,
        generatedAt: meta.generatedAt,
        negativePrompt: meta.negativePrompt || undefined,
        prompt: body,
      },
      mtime: file.lastModified,
    };
  } catch {
    return null;
  }
}

/* ─────────── videos ─────────── */

const VIDEOS_DIR = "videos";

export async function saveVideo(
  root: FileSystemDirectoryHandle,
  projectId: string,
  bytes: ArrayBuffer | Blob,
  filename: string
): Promise<void> {
  const dir = await ensureProjectDir(root, projectId);
  const vdir = await dir.getDirectoryHandle(VIDEOS_DIR, { create: true });
  const fh = await vdir.getFileHandle(filename, { create: true });
  const writable = await fh.createWritable();
  await writable.write(bytes);
  await writable.close();
}

export async function listVideos(
  root: FileSystemDirectoryHandle,
  projectId: string
): Promise<{ name: string; url: string; size: number }[]> {
  try {
    const dir = await root.getDirectoryHandle(projectId, { create: false });
    const vdir = await dir.getDirectoryHandle(VIDEOS_DIR, { create: false });
    const out: { name: string; url: string; size: number }[] = [];
    const iter = vdir as unknown as AsyncIterable<[string, FileSystemHandle]>;
    for await (const [name, h] of iter) {
      if (h.kind !== "file" || !name.endsWith(".mp4")) continue;
      const file = await (h as FileSystemFileHandle).getFile();
      out.push({
        name,
        url: URL.createObjectURL(file),
        size: file.size,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/* ─────────── prompt.md watcher ─────────── */

export type PromptWatchEvent =
  | { kind: "ready"; output: R2VPromptOutput; mtime: number }
  | { kind: "missing" }
  | { kind: "error"; error: unknown };

export type PromptWatchHandle = { stop: () => void };

/**
 * Polls prompt.md every `intervalMs`. Fires `onChange` when the file's
 * lastModified timestamp differs from the last seen value. The first
 * observation also fires (so the UI hydrates immediately). Stops on `stop()`.
 */
export function watchPrompt(
  root: FileSystemDirectoryHandle,
  projectId: string,
  onChange: (ev: PromptWatchEvent) => void,
  intervalMs = 800
): PromptWatchHandle {
  let stopped = false;
  let lastMtime = -1;

  async function tick() {
    if (stopped) return;
    try {
      const result = await readPrompt(root, projectId);
      if (!result) {
        if (lastMtime !== 0) {
          lastMtime = 0;
          onChange({ kind: "missing" });
        }
      } else if (result.mtime !== lastMtime) {
        lastMtime = result.mtime;
        onChange({ kind: "ready", output: result.output, mtime: result.mtime });
      }
    } catch (err) {
      onChange({ kind: "error", error: err });
    }
    if (!stopped) {
      window.setTimeout(tick, intervalMs);
    }
  }

  void tick();

  return {
    stop: () => {
      stopped = true;
    },
  };
}

/* ─────────── absolute path hint ─────────── */

/**
 * Best-effort human-readable path. The FSA API doesn't expose absolute paths
 * for security reasons, so we render `<root-name>/<project-id>` and let the
 * UI suggest the default location (`~/Documents/frame-0-projects/...`) only
 * when the root name matches.
 */
export function describeProjectLocation(
  rootName: string | undefined,
  projectId: string
): string {
  const root = rootName || "<root>";
  return `${root}/${projectId}`;
}
