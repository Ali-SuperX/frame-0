/**
 * LumenX 项目状态 —— zustand + localStorage 持久化（key: frame-0:lumenx）。
 * 仅前端文档结构；生成结果走共享 useStudioStore.jobs，这里只存 jobId + 展示 url。
 *
 * 架构：4 个 Tab（script/character/storyboard/timeline）+ 右侧 AI 对话面板，
 * 每个 Tab 拥有独立的 LxThread；store 顶层维护一份 chatContext 用于 UI 联动。
 */

"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  LxProject,
  LxAspect,
  LxTab,
  LxCharacter,
  LxScene,
  LxProp,
  LxShot,
  LxStyle,
  LxMessage,
  LxThread,
  LxChatContext,
  LxLightboxState,
  LxInspectTarget,
} from "./types";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  findImageModel,
  findVideoModel,
} from "./lxModels";

function uid(prefix = "lx"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function threadId(projectId: string, tab: LxTab): string {
  return `${projectId}-${tab}`;
}

type State = {
  projects: LxProject[];
  currentId: string | null;
  /** 右侧对话面板的当前联动上下文（跨 Project 不持久化的瞬时状态也放这里）。 */
  chatContext: LxChatContext | null;
  /** 全局 Lightbox 状态（null 即关闭）。 */
  lightbox: LxLightboxState | null;
  /**
   * 跨组件「请求 AI 回复」的临时槽位。
   * 任何地方调用 requestAssistant(tab, content) 都会写到这里；
   * ChatPanel 的 useEffect 监听它并自动触发一次 handleSend(content)，
   * 触发后立刻 clearPendingPrompt() 清空，避免重复发送。
   */
  pendingPrompt: { tab: LxTab; content: string; nonce: number } | null;
};

type Actions = {
  createProject: (input: { title?: string; sourceText: string; aspect: LxAspect }) => string;
  deleteProject: (id: string) => void;
  open: (id: string | null) => void;

  /** 浅合并当前项目。 */
  patch: (patch: Partial<LxProject>) => void;

  // ---- Tab + 对话 ----
  setTab: (tab: LxTab) => void;
  sendMessage: (tab: LxTab, message: Omit<LxMessage, "id" | "createdAt">) => void;
  appendAssistantMessage: (tab: LxTab, content: string, attachments?: string[]) => void;
  updateLastAssistantMessage: (tab: LxTab, content: string) => void;
  clearThread: (tab: LxTab) => void;
  setModel: (tab: LxTab, model: string) => void;
  setChatContext: (ctx: LxChatContext | null) => void;
  /**
   * 点击某个资产进入「检视模式」：查找它的 generationMeta，写到 chatContext.inspect 中。
   * 从而 ChatPanel 会反转为「编辑参数 → 重新生成」面板。
   * 资产没有 meta 时仅设 refType/refId，作为普通上下文。
   */
  inspectAsset: (target: { type: LxInspectTarget["type"]; id: string; media?: "image" | "video" }) => void;
  /** 开 Lightbox。 */
  openLightbox: (state: LxLightboxState) => void;
  closeLightbox: () => void;
  /** 让其他组件（如 ScriptTab 的「让 AI 从零起稿」按钮）请求一次 AI 回复。 */
  requestAssistant: (tab: LxTab, content: string) => void;
  /** ChatPanel 消费 pendingPrompt 后立刻清空，避免重复触发。 */
  clearPendingPrompt: () => void;

  // ---- 生成模型/参数 ----
  setImageModel: (modelId: string) => void;
  setVideoModel: (modelId: string) => void;
  setImageParams: (patch: Record<string, unknown>) => void;
  setVideoParams: (patch: Record<string, unknown>) => void;

  // ---- 实体批量 ----
  setEntities: (e: {
    title?: string;
    characters: LxCharacter[];
    scenes: LxScene[];
    props: LxProp[];
  }) => void;

  // ---- 角色 / 场景 / 道具 CRUD ----
  addCharacter: () => void;
  updateCharacter: (id: string, patch: Partial<LxCharacter>) => void;
  removeCharacter: (id: string) => void;

  addScene: () => void;
  updateScene: (id: string, patch: Partial<LxScene>) => void;
  removeScene: (id: string) => void;

  addProp: () => void;
  updateProp: (id: string, patch: Partial<LxProp>) => void;
  removeProp: (id: string) => void;

  // ---- 美术风格 ----
  selectStyle: (styleId: string) => void;
  setAiStyles: (styles: LxStyle[]) => void;
  addCustomStyle: (style: Omit<LxStyle, "id" | "isCustom">) => void;
  removeCustomStyle: (id: string) => void;

  // ---- 分镜 ----
  setShots: (shots: LxShot[]) => void;
  addShot: () => void;
  updateShot: (id: string, patch: Partial<LxShot>) => void;
  removeShot: (id: string) => void;
  moveShot: (id: string, dir: -1 | 1) => void;
  reorderShots: (fromId: string, toId: string) => void;
};

export const useLumenStore = create<State & Actions>()(
  persist(
    (set) => {
      /** 改当前项目并 bump updatedAt。 */
      const mut = (fn: (p: LxProject) => LxProject) =>
        set((s) => {
          if (!s.currentId) return s;
          return {
            projects: s.projects.map((p) =>
              p.id === s.currentId ? { ...fn(p), updatedAt: Date.now() } : p,
            ),
          };
        });

      /** 拿到（必要时懒创建）某 Tab 的 thread，并把更新后的 threads 写回。 */
      const mutThread = (tab: LxTab, fn: (t: LxThread) => LxThread) =>
        mut((p) => {
          const tid = threadId(p.id, tab);
          const existing = p.threads.find((t) => t.tab === tab);
          const base: LxThread = existing ?? { id: tid, tab, messages: [] };
          const next = fn(base);
          const threads = existing
            ? p.threads.map((t) => (t.tab === tab ? next : t))
            : [...p.threads, next];
          return { ...p, threads };
        });

      return {
        projects: [],
        currentId: null,
        chatContext: null,
        lightbox: null,
        pendingPrompt: null,

        createProject: ({ title, sourceText, aspect }) => {
          const id = uid("proj");
          const project: LxProject = {
            id,
            title: title?.trim() || "未命名短剧",
            sourceText: sourceText.trim(),
            aspect,
            tab: "script",
            aiStyles: [],
            customStyles: [],
            characters: [],
            scenes: [],
            props: [],
            shots: [],
            threads: [],
            imageModel: DEFAULT_IMAGE_MODEL,
            videoModel: DEFAULT_VIDEO_MODEL,
            imageParams: { ...(findImageModel(DEFAULT_IMAGE_MODEL)?.defaultParams ?? {}) },
            videoParams: { ...(findVideoModel(DEFAULT_VIDEO_MODEL)?.defaultParams ?? {}) },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          set((s) => ({ projects: [project, ...s.projects], currentId: id }));
          return id;
        },

        deleteProject: (id) =>
          set((s) => ({
            projects: s.projects.filter((p) => p.id !== id),
            currentId: s.currentId === id ? null : s.currentId,
          })),

        open: (id) => set({ currentId: id, chatContext: null, lightbox: null }),

        patch: (patch) => mut((p) => ({ ...p, ...patch })),

        // ---- Tab + 对话 ----
        setTab: (tab) => mut((p) => ({ ...p, tab })),

        sendMessage: (tab, message) =>
          mutThread(tab, (t) => ({
            ...t,
            messages: [
              ...t.messages,
              { ...message, id: uid("msg"), createdAt: Date.now() },
            ],
          })),

        appendAssistantMessage: (tab, content, attachments) =>
          mutThread(tab, (t) => ({
            ...t,
            messages: [
              ...t.messages,
              {
                id: uid("msg"),
                role: "assistant",
                content,
                attachments,
                createdAt: Date.now(),
              },
            ],
          })),

        updateLastAssistantMessage: (tab, content) =>
          mutThread(tab, (t) => {
            // 从后往前找最近一条 assistant 消息；找不到则追加一条。
            for (let i = t.messages.length - 1; i >= 0; i--) {
              if (t.messages[i].role === "assistant") {
                const messages = t.messages.slice();
                messages[i] = { ...messages[i], content };
                return { ...t, messages };
              }
            }
            return {
              ...t,
              messages: [
                ...t.messages,
                {
                  id: uid("msg"),
                  role: "assistant",
                  content,
                  createdAt: Date.now(),
                },
              ],
            };
          }),

        clearThread: (tab) => mutThread(tab, (t) => ({ ...t, messages: [] })),

        setModel: (tab, model) => mutThread(tab, (t) => ({ ...t, model })),

        setChatContext: (ctx) => set({ chatContext: ctx }),

        inspectAsset: ({ type, id, media }) =>
          set((s) => {
            const proj = s.projects.find((p) => p.id === s.currentId);
            if (!proj) return s;

            // 查找对应资产。shot 倒是区分图/视频，其它实体固定图片。
            let meta: LxChatContext["inspect"] | undefined;
            let url: string | undefined;
            let label: string | undefined;
            let refContent: string | undefined;
            const m: "image" | "video" = media ?? "image";

            if (type === "character") {
              const c = proj.characters.find((x) => x.id === id);
              if (c) {
                url = c.imageUrl;
                label = c.name;
                refContent = c.description;
                if (c.imageGen && url) {
                  meta = { type, id, media: "image", url, meta: c.imageGen };
                }
              }
            } else if (type === "scene") {
              const sc = proj.scenes.find((x) => x.id === id);
              if (sc) {
                url = sc.imageUrl;
                label = sc.name;
                refContent = sc.description;
                if (sc.imageGen && url) {
                  meta = { type, id, media: "image", url, meta: sc.imageGen };
                }
              }
            } else if (type === "prop") {
              const pr = proj.props.find((x) => x.id === id);
              if (pr) {
                url = pr.imageUrl;
                label = pr.name;
                refContent = pr.description;
                if (pr.imageGen && url) {
                  meta = { type, id, media: "image", url, meta: pr.imageGen };
                }
              }
            } else if (type === "shot") {
              const sh = proj.shots.find((x) => x.id === id);
              if (sh) {
                label = `分镜 #${sh.idx}`;
                refContent = sh.action;
                if (m === "video") {
                  url = sh.videoUrl;
                  if (sh.videoGen && url) {
                    meta = { type, id, media: "video", url, meta: sh.videoGen };
                  }
                } else {
                  url = sh.imageUrl;
                  if (sh.imageGen && url) {
                    meta = { type, id, media: "image", url, meta: sh.imageGen };
                  }
                }
              }
            }

            // 同步将项目级 imageModel/videoModel + params 调为 meta 中的值，让 GenConfig 选择框主动回填。
            // 该覆盖只在资产确实有 meta 时生效，避免点击旧资产误抹下一次默认。
            const projects = meta
              ? s.projects.map((p) => {
                  if (p.id !== s.currentId) return p;
                  if (m === "video") {
                    return {
                      ...p,
                      videoModel: meta!.meta.modelId,
                      videoParams: { ...meta!.meta.params },
                      updatedAt: Date.now(),
                    };
                  }
                  return {
                    ...p,
                    imageModel: meta!.meta.modelId,
                    imageParams: { ...meta!.meta.params },
                    updatedAt: Date.now(),
                  };
                })
              : s.projects;

            return {
              projects,
              chatContext: {
                tab: proj.tab,
                refType: type,
                refId: id,
                refLabel: label,
                refContent,
                inspect: meta,
              },
            };
          }),

        openLightbox: (state) => set({ lightbox: state }),
        closeLightbox: () => set({ lightbox: null }),

        requestAssistant: (tab, content) =>
          set({ pendingPrompt: { tab, content, nonce: Date.now() } }),

        clearPendingPrompt: () => set({ pendingPrompt: null }),

        // ---- 生成模型/参数 ----
        setImageModel: (modelId) =>
          mut((p) => {
            // 切模型时重置参数为新模型的默认值，避免旧 size 不在新模型 sizes 范围里。
            const next = findImageModel(modelId);
            return {
              ...p,
              imageModel: modelId,
              imageParams: { ...(next?.defaultParams ?? p.imageParams ?? {}) },
            };
          }),
        setVideoModel: (modelId) =>
          mut((p) => {
            const next = findVideoModel(modelId);
            return {
              ...p,
              videoModel: modelId,
              videoParams: { ...(next?.defaultParams ?? p.videoParams ?? {}) },
            };
          }),
        setImageParams: (patch) =>
          mut((p) => ({ ...p, imageParams: { ...(p.imageParams ?? {}), ...patch } })),
        setVideoParams: (patch) =>
          mut((p) => ({ ...p, videoParams: { ...(p.videoParams ?? {}), ...patch } })),

        // ---- 实体批量 ----
        setEntities: ({ title, characters, scenes, props }) =>
          mut((p) => ({
            ...p,
            title: title?.trim() || p.title,
            characters,
            scenes,
            props,
          })),

        // ---- 角色 ----
        addCharacter: () =>
          mut((p) => ({
            ...p,
            characters: [
              ...p.characters,
              {
                id: uid("char"),
                name: "新角色",
                description: "",
                visualWeight: 3,
                variants: [],
                status: "idle",
              },
            ],
          })),
        updateCharacter: (id, patch) =>
          mut((p) => ({
            ...p,
            characters: p.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
          })),
        removeCharacter: (id) =>
          mut((p) => ({ ...p, characters: p.characters.filter((c) => c.id !== id) })),

        // ---- 场景 ----
        addScene: () =>
          mut((p) => ({
            ...p,
            scenes: [
              ...p.scenes,
              { id: uid("scene"), name: "新场景", description: "", variants: [], status: "idle" },
            ],
          })),
        updateScene: (id, patch) =>
          mut((p) => ({
            ...p,
            scenes: p.scenes.map((c) => (c.id === id ? { ...c, ...patch } : c)),
          })),
        removeScene: (id) =>
          mut((p) => ({ ...p, scenes: p.scenes.filter((c) => c.id !== id) })),

        // ---- 道具 ----
        addProp: () =>
          mut((p) => ({
            ...p,
            props: [
              ...p.props,
              { id: uid("prop"), name: "新道具", description: "", variants: [], status: "idle" },
            ],
          })),
        updateProp: (id, patch) =>
          mut((p) => ({
            ...p,
            props: p.props.map((c) => (c.id === id ? { ...c, ...patch } : c)),
          })),
        removeProp: (id) =>
          mut((p) => ({ ...p, props: p.props.filter((c) => c.id !== id) })),

        // ---- 美术风格 ----
        selectStyle: (styleId) => mut((p) => ({ ...p, selectedStyleId: styleId })),
        setAiStyles: (styles) => mut((p) => ({ ...p, aiStyles: styles })),
        addCustomStyle: (style) =>
          mut((p) => ({
            ...p,
            customStyles: [
              ...p.customStyles,
              { ...style, id: uid("custom-style"), isCustom: true },
            ],
          })),
        removeCustomStyle: (id) =>
          mut((p) => ({
            ...p,
            customStyles: p.customStyles.filter((s) => s.id !== id),
            selectedStyleId: p.selectedStyleId === id ? undefined : p.selectedStyleId,
          })),

        // ---- 分镜 ----
        setShots: (shots) =>
          mut((p) => ({
            ...p,
            shots: shots.map((s, i) => ({ ...s, idx: i + 1 })),
          })),
        addShot: () =>
          mut((p) => ({
            ...p,
            shots: [
              ...p.shots,
              {
                id: uid("shot"),
                idx: p.shots.length + 1,
                characterIds: [],
                propIds: [],
                action: "",
                shotSize: "中景",
                camera: "still",
                imagePrompt: "",
                durationSec: 4,
                imageVariants: [],
                status: "idle",
              },
            ],
          })),
        updateShot: (id, patch) =>
          mut((p) => ({
            ...p,
            shots: p.shots.map((s) => (s.id === id ? { ...s, ...patch } : s)),
          })),
        removeShot: (id) =>
          mut((p) => ({
            ...p,
            shots: p.shots.filter((s) => s.id !== id).map((s, i) => ({ ...s, idx: i + 1 })),
          })),
        moveShot: (id, dir) =>
          mut((p) => {
            const idx = p.shots.findIndex((s) => s.id === id);
            const to = idx + dir;
            if (idx < 0 || to < 0 || to >= p.shots.length) return p;
            const shots = [...p.shots];
            [shots[idx], shots[to]] = [shots[to], shots[idx]];
            return { ...p, shots: shots.map((s, i) => ({ ...s, idx: i + 1 })) };
          }),
        reorderShots: (fromId, toId) =>
          mut((p) => {
            const fromIdx = p.shots.findIndex((s) => s.id === fromId);
            const toIdx = p.shots.findIndex((s) => s.id === toId);
            if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return p;
            const shots = [...p.shots];
            const [moved] = shots.splice(fromIdx, 1);
            shots.splice(toIdx, 0, moved);
            return { ...p, shots: shots.map((s, i) => ({ ...s, idx: i + 1 })) };
          }),
      };
    },
    {
      name: "frame-0:lumenx",
      storage: createJSONStorage(() => localStorage),
      version: 3,
      // chatContext 是瞬时 UI 状态，不持久化。
      partialize: (s) => ({ projects: s.projects, currentId: s.currentId }) as never,
      migrate: (persisted: unknown, fromVersion: number) => {
        if (!persisted || typeof persisted !== "object") return persisted as State;
        const s = persisted as {
          projects?: Array<Record<string, unknown>>;
          currentId?: string | null;
        };

        let projects = s.projects ?? [];

        // v1 → v2：合并「美术(style)」+「资产(cast)」为单一「美术(art)」步骤。
        if (fromVersion < 2) {
          projects = projects.map((p) => {
            const next: Record<string, unknown> = { ...p };
            if (next.step === "style" || next.step === "cast") next.step = "art";
            const done = { ...((p.done as Record<string, boolean>) || {}) };
            const styleDone = !!done.style;
            const castDone = !!done.cast;
            if ("style" in done) delete done.style;
            if ("cast" in done) delete done.cast;
            if (styleDone && castDone) done.art = true;
            next.done = done;
            return next;
          });
        }

        // v2 → v3：移除 step / done，新增 tab / threads。
        if (fromVersion < 3) {
          projects = projects.map((p) => {
            const next: Record<string, unknown> = { ...p };
            delete next.step;
            delete next.done;
            if (typeof next.tab !== "string") next.tab = "script";
            if (!Array.isArray(next.threads)) next.threads = [];
            return next;
          });
        }

        return { ...s, projects } as unknown as State;
      },
    },
  ),
);

/** 取当前项目（组件里直接用，避免重复写 find）。 */
export function useCurrentProject(): LxProject | undefined {
  return useLumenStore((s) => s.projects.find((p) => p.id === s.currentId));
}
