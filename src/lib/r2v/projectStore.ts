/**
 * R2V Project Workspace — state store.
 *
 * Two persistence layers:
 *   • localStorage (via zustand/persist) — small primitives: active project id,
 *     last-known root name, last-edit timestamps.
 *   • IndexedDB — the FileSystemDirectoryHandle (which can't be JSON-serialised)
 *     plus per-project drafts so unsaved fields survive reload.
 *
 * The store NEVER auto-prompts the user for a directory — it just remembers
 * what was chosen last time and surfaces a `needsRoot` flag the UI can react to.
 */

"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  R2VProjectInput,
  R2VProjectInputSchema,
  R2VPromptOutput,
  emptyProjectInput,
} from "./schema";
import {
  isFsaSupported,
  pickRootDirectory,
  reauthorizeRoot,
  verifyRoot,
  writeInput,
  readInput,
  ensureProjectDir,
  readPrompt,
  watchPrompt,
  listVideos,
  saveVideo,
  listProjectIds,
  type PromptWatchHandle,
} from "./filesystem";

/* ─────────── IndexedDB plumbing (zero-dep, plain API) ─────────── */

const DB_NAME = "frame-0-r2v";
const DB_VERSION = 1;
const STORE_HANDLES = "handles";
const STORE_DRAFTS = "drafts";
const KEY_ROOT_HANDLE = "rootHandle";

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE_HANDLES)) {
          d.createObjectStore(STORE_HANDLES);
        }
        if (!d.objectStoreNames.contains(STORE_DRAFTS)) {
          d.createObjectStore(STORE_DRAFTS);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function txn(
  store: string,
  mode: IDBTransactionMode
): Promise<IDBObjectStore> {
  return db().then((d) => d.transaction(store, mode).objectStore(store));
}

async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const os = await txn(store, "readonly");
  return new Promise((resolve, reject) => {
    const req = os.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut<T>(store: string, key: string, value: T): Promise<void> {
  const os = await txn(store, "readwrite");
  return new Promise((resolve, reject) => {
    const req = os.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
async function idbDel(store: string, key: string): Promise<void> {
  const os = await txn(store, "readwrite");
  return new Promise((resolve, reject) => {
    const req = os.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ─────────── store ─────────── */

export type Stage = 1 | 2 | 3;

export type R2VVideoEntry = {
  name: string;
  url: string; // blob: URL freshly minted on load — re-fetch when project changes
  size: number;
  generatedAt?: number;
};

export type R2VProjectMeta = {
  projectId: string;
  title: string;
  updatedAt: string;
};

type R2VStoreState = {
  /** True only on browsers without window.showDirectoryPicker. */
  fsaUnsupported: boolean;
  /** RW-authorized root directory handle; null until user picks one. */
  rootHandle: FileSystemDirectoryHandle | null;
  /** Cached root display name for path hints. */
  rootName: string | undefined;
  /** When true, store finished its first hydration pass (handle restore + perm check). */
  hydrated: boolean;

  /** Currently open project. Null between sessions or before the user picks one. */
  current: R2VProjectInput | null;
  /**
   * True when `current` is an in-memory draft that hasn't been written to disk
   * yet. Lets the user start filling fields before they pick a workspace root.
   * `updateInput` skips disk writes while this is true; `persistDraft()`
   * triggers the FSA prompt and flips it to false.
   */
  unsavedDraft: boolean;
  /** Active stage card (1=Inputs, 2=Prompt, 3=Video). */
  stage: Stage;

  /** Latest agent-written prompt for the current project. */
  promptOutput: R2VPromptOutput | null;
  /** Last seen prompt.md mtime — used to detect "new prompt arrived". */
  promptMtime: number | null;
  /** 生成历史——按 projectId 隔离；每个项目最多保留 20 条非收藏 + 全部收藏 */
  promptHistoryByProject: Record<string, PromptHistoryEntry[]>;

  /** Videos sitting in <project>/videos/. */
  videos: R2VVideoEntry[];

  /** Project list (just ids — full inputs are loaded on open). */
  projectIds: string[];

  /** Transient flags. */
  busy: boolean;
  errorMessage: string | null;

  /* ── actions ── */
  hydrate: () => Promise<void>;
  pickRoot: () => Promise<void>;
  reauthorize: () => Promise<boolean>;
  refreshProjectList: () => Promise<void>;
  /** Spin up an empty in-memory draft (no disk write). */
  startBlankDraft: (locale: "zh" | "en") => void;
  /** Pick workspace + write the current draft to disk, flip unsavedDraft=false. */
  persistDraft: () => Promise<void>;
  newProject: (title: string, locale: "zh" | "en") => Promise<void>;
  openProject: (projectId: string) => Promise<void>;
  closeProject: () => void;
  setStage: (stage: Stage) => void;
  updateInput: (
    patch: Partial<R2VProjectInput> | ((prev: R2VProjectInput) => R2VProjectInput)
  ) => Promise<void>;
  refreshVideos: () => Promise<void>;
  ingestVideo: (bytes: Blob, hint?: string) => Promise<string | null>;
  /** Manually set a prompt (paste-back from agent). */
  setPromptManual: (prompt: string, negativePrompt?: string) => void;
  /** 历史相关 actions */
  addPromptHistory: (entry: Omit<PromptHistoryEntry, "id" | "createdAt">) => void;
  togglePromptHistoryFavorite: (id: string) => void;
  removePromptHistory: (id: string) => void;
  restorePromptHistory: (id: string) => void;
  clearPromptHistory: () => void;
  setError: (msg: string | null) => void;
};

/** 提示词生成历史的单条记录 */
export type PromptHistoryEntry = {
  id: string;
  createdAt: number;
  /** AI 输出的完整 prompt */
  prompt: string;
  /** 抽取出的 negative */
  negativePrompt?: string;
  /** 当时用的预设 id */
  presetId?: string;
  /** 当时的模型 id */
  model?: string;
  /** 用户标记为收藏 */
  favorite?: boolean;
  /** 简短摘要（前 80 字） */
  summary?: string;
};

/** Small persisted slice — what survives a reload via localStorage. */
type Persisted = {
  rootName: string | undefined;
  /** Last opened on-disk project id (for auto-restore on hydrate). */
  lastActiveProjectId: string | null;
  stage: Stage;
  /** The in-memory draft (only when not yet written to disk). */
  current: R2VProjectInput | null;
  unsavedDraft: boolean;
  /** Prompt 生成历史（按 projectId 隔离），跨会话保留 */
  promptHistoryByProject?: Record<string, PromptHistoryEntry[]>;
};

let watchHandle: PromptWatchHandle | null = null;

function stopWatch() {
  if (watchHandle) {
    watchHandle.stop();
    watchHandle = null;
  }
}

export const useR2VStore = create<R2VStoreState>()(
  persist(
    (set, get) => ({
      fsaUnsupported: false,
      rootHandle: null,
      rootName: undefined,
      hydrated: false,

      current: null,
      unsavedDraft: false,
      stage: 1,

      promptOutput: null,
      promptMtime: null,
      promptHistoryByProject: {},

      videos: [],

      projectIds: [],

      busy: false,
      errorMessage: null,

      hydrate: async () => {
        if (typeof window === "undefined") return;
        const supported = isFsaSupported();
        if (!supported) {
          set({ fsaUnsupported: true, hydrated: true });
          return;
        }
        try {
          const handle = await idbGet<FileSystemDirectoryHandle>(
            STORE_HANDLES,
            KEY_ROOT_HANDLE
          );
          if (!handle) {
            set({ hydrated: true });
            return;
          }
          const verdict = await verifyRoot(handle);
          if (verdict.ok) {
            set({ rootHandle: handle, rootName: handle.name });
            await get().refreshProjectList();
            // Auto-restore last on-disk project — but only if there isn't an
            // unsaved draft already in memory (we don't want to clobber the
            // user's in-progress edits).
            const persisted = (
              get() as unknown as { _persisted?: Persisted }
            )._persisted;
            if (
              !get().unsavedDraft &&
              persisted?.lastActiveProjectId &&
              !get().current
            ) {
              await get().openProject(persisted.lastActiveProjectId);
            }
          } else {
            // Keep the handle but defer reauthorize to a user gesture.
            set({ rootHandle: handle, rootName: handle.name });
          }
        } catch (err) {
          console.warn("[r2v] hydrate failed", err);
        } finally {
          set({ hydrated: true });
        }
      },

      pickRoot: async () => {
        try {
          const handle = await pickRootDirectory();
          await idbPut(STORE_HANDLES, KEY_ROOT_HANDLE, handle);
          set({ rootHandle: handle, rootName: handle.name, errorMessage: null });
          await get().refreshProjectList();
        } catch (err) {
          // User cancelled or denied — leave state untouched.
          if ((err as DOMException)?.name !== "AbortError") {
            set({ errorMessage: String((err as Error)?.message || err) });
          }
        }
      },

      reauthorize: async () => {
        const handle = get().rootHandle;
        if (!handle) return false;
        const ok = await reauthorizeRoot(handle);
        if (ok) await get().refreshProjectList();
        return ok;
      },

      refreshProjectList: async () => {
        const handle = get().rootHandle;
        if (!handle) return;
        try {
          const ids = await listProjectIds(handle);
          set({ projectIds: ids });
        } catch (err) {
          console.warn("[r2v] listProjectIds failed", err);
        }
      },

      startBlankDraft: (locale) => {
        stopWatch();
        const input = emptyProjectInput({ locale });
        // Revoke any video blob urls from the previous project.
        for (const v of get().videos) {
          if (v.url.startsWith("blob:")) URL.revokeObjectURL(v.url);
        }
        set({
          current: input,
          unsavedDraft: true,
          stage: 1,
          promptOutput: null,
          promptMtime: null,
          videos: [],
          errorMessage: null,
        });
      },

      persistDraft: async () => {
        const cur = get().current;
        if (!cur) return;
        // Make sure we have a usable root.
        let handle = get().rootHandle;
        if (!handle) {
          await get().pickRoot();
          handle = get().rootHandle;
          if (!handle) {
            // User cancelled / denied.
            return;
          }
        } else {
          const verdict = await verifyRoot(handle);
          if (!verdict.ok) {
            const ok = await get().reauthorize();
            if (!ok) return;
          }
        }
        await ensureProjectDir(handle!, cur.projectId);
        await writeInput(handle!, cur);
        set({ unsavedDraft: false, errorMessage: null });
        await get().refreshProjectList();
        // Start watching prompt.md for this project so the UI reacts when the
        // agent writes back later.
        watchHandle = watchPrompt(handle!, cur.projectId, (ev) => {
          if (ev.kind === "ready") {
            const wasMissing = !get().promptOutput;
            set({
              promptOutput: ev.output,
              promptMtime: ev.mtime,
              stage: wasMissing ? 2 : get().stage,
              errorMessage: null,
            });
          } else if (ev.kind === "missing") {
            if (!get().promptOutput) {
              set({ promptOutput: null, promptMtime: null });
            }
          }
        });
      },

      newProject: async (title, locale) => {
        const handle = get().rootHandle;
        if (!handle) {
          set({ errorMessage: "请先选择工作目录 / Pick a workspace directory first" });
          return;
        }
        const input = emptyProjectInput({ title, locale });
        await ensureProjectDir(handle, input.projectId);
        await writeInput(handle, input);
        set({
          current: input,
          unsavedDraft: false,
          stage: 1,
          promptOutput: null,
          promptMtime: null,
          videos: [],
          errorMessage: null,
        });
        await get().refreshProjectList();
      },

      openProject: async (projectId) => {
        const handle = get().rootHandle;
        if (!handle) return;
        stopWatch();
        set({ busy: true });
        try {
          const input = await readInput(handle, projectId);
          if (!input) {
            set({ errorMessage: `未找到项目 ${projectId}` });
            return;
          }
          set({
            current: input,
            unsavedDraft: false,
            stage: 1,
            promptOutput: null,
            promptMtime: null,
            videos: [],
            errorMessage: null,
          });
          // Hydrate prompt + videos.
          const existing = await readPrompt(handle, projectId);
          if (existing) {
            set({
              promptOutput: existing.output,
              promptMtime: existing.mtime,
              stage: 2,
            });
          }
          await get().refreshVideos();

          // Start watching prompt.md.
          watchHandle = watchPrompt(handle, projectId, (ev) => {
            if (ev.kind === "ready") {
              const wasMissing = !get().promptOutput;
              set({
                promptOutput: ev.output,
                promptMtime: ev.mtime,
                stage: wasMissing ? 2 : get().stage,
                errorMessage: null,
              });
            } else if (ev.kind === "missing") {
              // Don't downgrade an already-loaded prompt; agents may transiently
              // remove + recreate the file.
              if (!get().promptOutput) {
                set({ promptOutput: null, promptMtime: null });
              }
            } else if (ev.kind === "error") {
              set({
                errorMessage: `Watch error: ${String(
                  (ev.error as Error)?.message || ev.error
                )}`,
              });
            }
          });
        } finally {
          set({ busy: false });
        }
      },

      closeProject: () => {
        stopWatch();
        // Revoke any blob URLs we created for video previews.
        for (const v of get().videos) {
          if (v.url.startsWith("blob:")) URL.revokeObjectURL(v.url);
        }
        set({
          current: null,
          unsavedDraft: false,
          stage: 1,
          promptOutput: null,
          promptMtime: null,
          videos: [],
        });
      },

      setStage: (stage) => set({ stage }),

      updateInput: async (patch) => {
        const cur = get().current;
        if (!cur) return;
        const next =
          typeof patch === "function"
            ? (patch as (prev: R2VProjectInput) => R2VProjectInput)(cur)
            : { ...cur, ...patch };
        // Always bump updatedAt.
        const stamped = { ...next, updatedAt: new Date().toISOString() };
        const parsed = R2VProjectInputSchema.safeParse(stamped);
        if (!parsed.success) {
          set({
            errorMessage: parsed.error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; "),
          });
          return;
        }
        set({ current: parsed.data, errorMessage: null });
        // While the draft hasn't been persisted yet, the change lives only in
        // memory + zustand/persist (localStorage). Real disk write happens on
        // `persistDraft()`, after the user picks a workspace.
        if (get().unsavedDraft) return;
        const handle = get().rootHandle;
        if (!handle) return;
        try {
          await writeInput(handle, parsed.data);
          await idbPut(STORE_DRAFTS, parsed.data.projectId, parsed.data);
        } catch (err) {
          set({
            errorMessage: `Save failed: ${String((err as Error)?.message || err)}`,
          });
        }
      },

      refreshVideos: async () => {
        const handle = get().rootHandle;
        const cur = get().current;
        if (!handle || !cur) return;
        // Revoke previous blob URLs first.
        for (const v of get().videos) {
          if (v.url.startsWith("blob:")) URL.revokeObjectURL(v.url);
        }
        const list = await listVideos(handle, cur.projectId);
        set({ videos: list });
      },

      ingestVideo: async (bytes, hint) => {
        const handle = get().rootHandle;
        const cur = get().current;
        if (!handle || !cur) return null;
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const filename = `${stamp}${hint ? `-${hint}` : ""}.mp4`;
        try {
          await saveVideo(handle, cur.projectId, bytes, filename);
          await get().refreshVideos();
          return filename;
        } catch (err) {
          set({
            errorMessage: `Save video failed: ${String((err as Error)?.message || err)}`,
          });
          return null;
        }
      },

      setPromptManual: (prompt, negativePrompt) => {
        const cur = get().current;
        if (!cur) return;
        set({
          promptOutput: {
            projectId: cur.projectId,
            model: "manual",
            generatedAt: new Date().toISOString(),
            negativePrompt,
            prompt,
          },
          promptMtime: Date.now(),
          errorMessage: null,
        });
      },

      addPromptHistory: (entry) => {
        const cur = get().current;
        if (!cur) return;
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const next: PromptHistoryEntry = {
          id,
          createdAt: Date.now(),
          summary: entry.prompt.slice(0, 80).replace(/\s+/g, " "),
          ...entry,
        };
        const map = { ...get().promptHistoryByProject };
        const list = map[cur.projectId] || [];
        const favorites = list.filter((h) => h.favorite);
        const recent = list.filter((h) => !h.favorite).slice(0, 19);
        map[cur.projectId] = [next, ...favorites, ...recent];
        set({ promptHistoryByProject: map });
      },

      togglePromptHistoryFavorite: (id) => {
        const cur = get().current;
        if (!cur) return;
        const map = { ...get().promptHistoryByProject };
        const list = map[cur.projectId] || [];
        map[cur.projectId] = list.map((h) =>
          h.id === id ? { ...h, favorite: !h.favorite } : h
        );
        set({ promptHistoryByProject: map });
      },

      removePromptHistory: (id) => {
        const cur = get().current;
        if (!cur) return;
        const map = { ...get().promptHistoryByProject };
        const list = map[cur.projectId] || [];
        map[cur.projectId] = list.filter((h) => h.id !== id);
        set({ promptHistoryByProject: map });
      },

      restorePromptHistory: (id) => {
        const cur = get().current;
        if (!cur) return;
        const list = get().promptHistoryByProject[cur.projectId] || [];
        const entry = list.find((h) => h.id === id);
        if (!entry) return;
        set({
          promptOutput: {
            projectId: cur.projectId,
            model: entry.model || "history",
            generatedAt: new Date(entry.createdAt).toISOString(),
            negativePrompt: entry.negativePrompt,
            prompt: entry.prompt,
          },
          promptMtime: Date.now(),
          errorMessage: null,
        });
      },

      clearPromptHistory: () => {
        const cur = get().current;
        if (!cur) return;
        const map = { ...get().promptHistoryByProject };
        const list = map[cur.projectId] || [];
        map[cur.projectId] = list.filter((h) => h.favorite);
        set({ promptHistoryByProject: map });
      },

      setError: (msg) => set({ errorMessage: msg }),
    }),
    {
      name: "frame-0-r2v",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Persist enough to bring the user back to where they were:
      //   • workspace name (to render the badge before async re-auth)
      //   • last on-disk project id (so hydrate can re-open it)
      //   • the in-memory draft (so unsaved fields survive reload)
      // The directory handle itself lives in IndexedDB (separate from this).
      partialize: (s): Persisted => ({
        rootName: s.rootName,
        lastActiveProjectId: !s.unsavedDraft
          ? s.current?.projectId ?? null
          : null,
        stage: s.stage,
        current: s.unsavedDraft ? s.current : null,
        unsavedDraft: s.unsavedDraft,
        promptHistoryByProject: s.promptHistoryByProject,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.warn("[r2v] rehydrate", error);
        if (!state) return;
        // Stash the slice so hydrate() can decide whether to auto-open a
        // saved project after permission re-check.
        (state as unknown as { _persisted?: Persisted })._persisted = {
          rootName: state.rootName,
          lastActiveProjectId: !state.unsavedDraft
            ? state.current?.projectId ?? null
            : null,
          stage: state.stage,
          current: state.unsavedDraft ? state.current : null,
          unsavedDraft: state.unsavedDraft,
          promptHistoryByProject: state.promptHistoryByProject,
        };
      },
    }
  )
);

/* ─────────── helpers ─────────── */

/** Convenience selector — null-safe stage check. */
export function isStageReady(state: R2VStoreState, stage: Stage): boolean {
  if (!state.current) return false;
  if (stage === 1) return true;
  if (stage === 2) {
    return state.current.references.some((r) => !!r.url);
  }
  if (stage === 3) {
    return !!state.promptOutput?.prompt;
  }
  return false;
}

/** Reset persisted root (debug). */
export async function clearPersistedRoot() {
  await idbDel(STORE_HANDLES, KEY_ROOT_HANDLE);
  useR2VStore.setState({
    rootHandle: null,
    rootName: undefined,
    projectIds: [],
  });
}
