"use client";

/**
 * canvasStore —— 工坊「画布形态」的图数据。
 *
 * 项目维度：画布由多个「项目」组成，每个项目是一张独立的图(节点 + 连线)，
 * 可新建 / 切换 / 重命名 / 删除，各自自动持久化。顶层 nodes/edges 是「当前
 * 活动项目」的镜像 —— 让渲染层(Canvas / Archive)直接读，无需关心项目结构，
 * 也就不必改动现有读写代码。
 *
 * 节点只存「布局 + 引用」(坐标 / jobId / compose 草稿)；真正的生成结果始终
 * 从主 store 的 jobs 反查 —— 画布与线性工坊共享同一份 jobs。
 *
 * 持久化走 localStorage：图很小，blob 媒体跨 session 失效可接受(成片结果 URL
 * 在 jobs 里另存)。
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Draft, JobMedia } from "./store";

/** 持久化前剥离 blob: 预览 —— 跨 session 失效，留着会让媒体框裂图 + 报
 *  ERR_FILE_NOT_FOUND。保留 url(OSS / api-uploads，刷新后仍可加载)。 */
function stripCanvasMedia(media: Draft["media"]): Draft["media"] {
  const strip = (m: JobMedia) => ({ ...m, previewUrl: undefined });
  const out: Draft["media"] = { ...media };
  (["img_url", "last_frame_url", "first_clip_url", "audio_url", "video_url"] as const).forEach(
    (k) => {
      const m = out[k];
      if (m) out[k] = strip(m);
    }
  );
  (["reference_urls", "ref_images"] as const).forEach((k) => {
    const arr = out[k];
    if (arr) out[k] = arr.map(strip);
  });
  return out;
}

/** 节点类型 —— 缺省 generate（兼容旧数据）。note=创意/剧本文本；character/scene/prop=可复用资产卡（角色/场景/道具）；
 *  chat=对话输入节点（问题）；answer=对话输出节点（AI 回答，text 存正文）。 */
export type CanvasNodeKind = "generate" | "note" | "character" | "scene" | "prop" | "chat" | "answer";

export type CanvasNode = {
  id: string;
  x: number;
  y: number;
  /** 节点类型，缺省 "generate"。 */
  kind?: CanvasNodeKind;
  /** 关联的生成任务 —— 生成后写入；从主 store jobs 反查状态与结果。 */
  jobId?: string;
  /** drama pipeline：静帧出图 job */
  imageJobId?: string;
  /** drama pipeline：I2V 出视频 job */
  videoJobId?: string;
  /** drama pipeline：TTS 配音 job */
  voiceJobId?: string;
  /** compose 草稿 —— 生成前的 prompt / 模型 / 媒体 / 参数。 */
  draft: Draft;
  /** note 标题 / character·scene 名字。 */
  title?: string;
  /** note 正文 / character·scene 描述。 */
  text?: string;
  /** 编排模式标记（由 AI 编排写入，用于 drama-info 显示与后续导出）。 */
  orchMode?: "creative" | "drama";
  /** 所属节点组 —— 一次短剧编排的节点共享一个 groupId（剧集组框/进度坞归属）。 */
  groupId?: string;
  /** 角色序号(1-9)：r2v 多参考 character1..N 稳定映射，doAssets 按 appearsIn 主次打号。 */
  charIdx?: number;
  /** 手动 resize 后的节点宽度(世界坐标)；未设则按 kind 取默认宽。 */
  w?: number;
  h?: number; // 手动 resize 后的节点高度(世界坐标),未设则内容自适应
  /** character：性别(配音选音色)。 */
  gender?: "male" | "female";
  /** character：性格基调(中文,配音选音色)。 */
  voiceTone?: string;
  /** character：预选音色 id(doAssets 落节点时按性别+性格挑好)。 */
  voicePreset?: string;
  /** generate：配音音频实际时长(秒,成片卡点对齐用)。 */
  voiceDur?: number;
  /** character/prop：参考图已锁定(上传/指定立绘)，下游出图保持一致。 */
  locked?: boolean;
  /** drama：本节点是某分镜的「视频输出节点」，值为来源分镜 id。
   *  节点原则：分镜=输入(只读不被占据)，生视频→新建独立视频输出节点连其下方。
   *  videoJobId/imageJobId/voiceJobId 挂在本节点；读取方按此标记顺血缘解析(向后兼容旧 videoJobId 仍在分镜上的数据)。 */
  dramaVideoOf?: string;
  /** drama：视频输出节点的「接上一镜」开关。开 → 出视频时取上一镜(按 x/y 序)视频的实际尾帧当本段第一帧，
   *  soft 衔接(r2v，尾帧=图1，角色/场景/道具退后)，让镜头接续上一镜画面继续演。首镜/上一镜无视频则回退普通生成。 */
  continuePrev?: boolean;
  /** drama「取片」：同一镜重生成不覆盖，而是 push 一条 take(每条 = 视频 job id + 生成时间戳)。
   *  不变式：takes 非空时 videoJobId 始终 === takes[activeTakeIdx].jobId(读取方零改，takes 仅叠加历史 + 切换能力)。 */
  takes?: { jobId: string; at: number }[];
  activeTakeIdx?: number;
};

export type CanvasEdge = { id: string; source: string; target: string };

/** 节点组 —— 一部短剧的边界（剧集组框）。组内节点共享 groupId。 */
export type CanvasGroup = {
  id: string;
  title: string;
  collapsed: boolean;
  /** 目前仅短剧编排成组；保留字段供未来扩展。 */
  kind: "drama";
  createdAt: number;
};

/** 一个画布项目 = 一张独立的图。 */
export type CanvasProject = {
  id: string;
  name: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  /** 节点组（短剧剧集框）。缺省空数组（兼容旧数据）。 */
  groups?: CanvasGroup[];
  createdAt: number;
  updatedAt: number;
};

let _seq = 0;
function cid(prefix: string): string {
  _seq += 1;
  // 不依赖 Math.random（与主 store 一致的可复现风格）；时间 + 序号足够唯一。
  return `${prefix}_${_seq}_${Date.now().toString(36)}`;
}

function makeProject(name: string): CanvasProject {
  const t = Date.now();
  return { id: cid("proj"), name, nodes: [], edges: [], groups: [], createdAt: t, updatedAt: t };
}

const DEFAULT_NAME = "默认画布";
const FIRST_PROJECT = makeProject(DEFAULT_NAME);

type CanvasState = {
  /** 活动项目的节点镜像(渲染层直接读)。 */
  nodes: CanvasNode[];
  /** 活动项目的连线镜像。 */
  edges: CanvasEdge[];
  /** 活动项目的节点组镜像。 */
  groups: CanvasGroup[];
  projects: CanvasProject[];
  activeId: string;
  /** persist rehydrate 是否完成 —— 渲染层据此守卫空态卡，避免返回用户闪一帧空态。 */
  hasHydrated: boolean;
  setHasHydrated: () => void;

  // —— 节点 / 连线操作：作用于活动项目，并同步顶层镜像 ——
  addNode: (node: { x: number; y: number; draft: Draft; jobId?: string; imageJobId?: string; videoJobId?: string; voiceJobId?: string; kind?: CanvasNodeKind; title?: string; text?: string; orchMode?: "creative" | "drama"; groupId?: string; dramaVideoOf?: string; continuePrev?: boolean }) => string;
  updateNode: (id: string, patch: Partial<Omit<CanvasNode, "id" | "draft">>) => void;
  updateDraft: (id: string, patch: Partial<Draft>) => void;
  moveNode: (id: string, x: number, y: number) => void;
  removeNode: (id: string) => void;
  addEdge: (source: string, target: string) => void;
  removeEdge: (id: string) => void;
  clearCanvas: () => void;
  /** 撤销删除 —— 把节点/边/组按原 id 塞回(去重)，供 undo toast 调用。 */
  restore: (nodes: CanvasNode[], edges: CanvasEdge[], groups?: CanvasGroup[]) => void;

  // —— 节点组（短剧剧集框）——
  addGroup: (title: string) => string;
  updateGroup: (id: string, patch: Partial<Pick<CanvasGroup, "title" | "collapsed">>) => void;
  /** 删组 —— withNodes=true 连同组内节点+边一起删；否则只解散组(节点留下)。 */
  removeGroup: (id: string, withNodes?: boolean) => void;
  /** 整组平移 —— 组内所有节点同步偏移 (dx,dy)。 */
  moveGroup: (id: string, dx: number, dy: number) => void;

  // —— 项目管理 ——
  newProject: (name: string) => string;
  switchProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
};

export const useCanvasStore = create<CanvasState>()(
  persist(
    (set, get) => {
      /** 改活动项目的 nodes/edges/groups，并同步顶层镜像 + bump updatedAt。 */
      const mutateActive = (
        fn: (p: CanvasProject) => Partial<Pick<CanvasProject, "nodes" | "edges" | "groups">>
      ) => {
        const { projects, activeId } = get();
        const idx = projects.findIndex((p) => p.id === activeId);
        if (idx < 0) return;
        const patch = fn(projects[idx]);
        if (!("nodes" in patch) && !("edges" in patch) && !("groups" in patch)) return; // no-op 守卫
        const updated: CanvasProject = { ...projects[idx], ...patch, updatedAt: Date.now() };
        const next = projects.slice();
        next[idx] = updated;
        set({ projects: next, nodes: updated.nodes, edges: updated.edges, groups: updated.groups ?? [] });
      };

      return {
        nodes: FIRST_PROJECT.nodes,
        edges: FIRST_PROJECT.edges,
        groups: FIRST_PROJECT.groups ?? [],
        projects: [FIRST_PROJECT],
        activeId: FIRST_PROJECT.id,
        hasHydrated: false,
        setHasHydrated: () => set({ hasHydrated: true }),

        addNode: ({ x, y, draft, jobId, imageJobId, videoJobId, voiceJobId, kind, title, text, orchMode, groupId, dramaVideoOf, continuePrev }) => {
          const id = cid("n");
          mutateActive((p) => ({ nodes: [...p.nodes, { id, x, y, draft, jobId, imageJobId, videoJobId, voiceJobId, kind, title, text, orchMode, groupId, dramaVideoOf, continuePrev }] }));
          return id;
        },

        updateNode: (id, patch) =>
          mutateActive((p) => ({
            nodes: p.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
          })),

        updateDraft: (id, patch) =>
          mutateActive((p) => ({
            nodes: p.nodes.map((n) =>
              n.id === id ? { ...n, draft: { ...n.draft, ...patch } } : n
            ),
          })),

        moveNode: (id, x, y) =>
          mutateActive((p) => ({
            nodes: p.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
          })),

        removeNode: (id) =>
          mutateActive((p) => ({
            nodes: p.nodes.filter((n) => n.id !== id),
            edges: p.edges.filter((e) => e.source !== id && e.target !== id),
          })),

        addEdge: (source, target) =>
          mutateActive((p) => {
            if (source === target) return {};
            if (p.edges.some((e) => e.source === source && e.target === target)) return {};
            return { edges: [...p.edges, { id: cid("e"), source, target }] };
          }),

        removeEdge: (id) =>
          mutateActive((p) => ({ edges: p.edges.filter((e) => e.id !== id) })),

        clearCanvas: () => mutateActive(() => ({ nodes: [], edges: [], groups: [] })),

        restore: (nodes, edges, groups) =>
          mutateActive((p) => ({
            nodes: [...p.nodes, ...nodes.filter((n) => !p.nodes.some((x) => x.id === n.id))],
            edges: [...p.edges, ...edges.filter((e) => !p.edges.some((x) => x.id === e.id))],
            groups: [
              ...(p.groups ?? []),
              ...(groups ?? []).filter((g) => !(p.groups ?? []).some((x) => x.id === g.id)),
            ],
          })),

        addGroup: (title) => {
          const id = cid("g");
          mutateActive((p) => ({
            groups: [...(p.groups ?? []), { id, title: title.trim() || "短剧", collapsed: false, kind: "drama", createdAt: Date.now() }],
          }));
          return id;
        },

        updateGroup: (id, patch) =>
          mutateActive((p) => ({
            groups: (p.groups ?? []).map((g) => (g.id === id ? { ...g, ...patch } : g)),
          })),

        removeGroup: (id, withNodes) =>
          mutateActive((p) => {
            const groups = (p.groups ?? []).filter((g) => g.id !== id);
            if (!withNodes) {
              // 解散：节点保留，清掉 groupId
              return { groups, nodes: p.nodes.map((n) => (n.groupId === id ? { ...n, groupId: undefined } : n)) };
            }
            const killIds = new Set(p.nodes.filter((n) => n.groupId === id).map((n) => n.id));
            return {
              groups,
              nodes: p.nodes.filter((n) => !killIds.has(n.id)),
              edges: p.edges.filter((e) => !killIds.has(e.source) && !killIds.has(e.target)),
            };
          }),

        moveGroup: (id, dx, dy) =>
          mutateActive((p) => ({
            nodes: p.nodes.map((n) => (n.groupId === id ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
          })),

        newProject: (name) => {
          const proj = makeProject(name.trim() || DEFAULT_NAME);
          set({
            projects: [...get().projects, proj],
            activeId: proj.id,
            nodes: proj.nodes,
            edges: proj.edges,
            groups: proj.groups ?? [],
          });
          return proj.id;
        },

        switchProject: (id) => {
          const { projects, activeId } = get();
          if (id === activeId) return;
          const p = projects.find((x) => x.id === id);
          if (!p) return;
          set({ activeId: id, nodes: p.nodes, edges: p.edges, groups: p.groups ?? [] });
        },

        renameProject: (id, name) => {
          const clean = name.trim();
          if (!clean) return;
          set({
            projects: get().projects.map((p) =>
              p.id === id ? { ...p, name: clean, updatedAt: Date.now() } : p
            ),
          });
        },

        deleteProject: (id) => {
          const { projects, activeId } = get();
          if (projects.length <= 1) return; // 至少保留一个项目
          const next = projects.filter((p) => p.id !== id);
          if (activeId === id) {
            const fallback = next[0];
            set({
              projects: next,
              activeId: fallback.id,
              nodes: fallback.nodes,
              edges: fallback.edges,
              groups: fallback.groups ?? [],
            });
          } else {
            set({ projects: next });
          }
        },
      };
    },
    {
      name: "frame-0:canvas",
      version: 1,
      onRehydrateStorage: () => (state) => { state?.setHasHydrated(); },
      storage: createJSONStorage(() => localStorage),
      // 只持久化 projects + activeId；顶层 nodes/edges 是镜像，rehydrate 时
      // 由 merge 从活动项目重建。每个项目的节点剥离 blob 预览(保留 url)。
      partialize: (s) => ({
        activeId: s.activeId,
        projects: s.projects.map((proj) => ({
          ...proj,
          nodes: proj.nodes.map((n) => ({
            ...n,
            draft: { ...n.draft, media: stripCanvasMedia(n.draft.media) },
          })),
        })),
      }),
      // v0(单一 {nodes,edges}) → v1(projects[])：把旧画布包成「默认画布」。
      migrate: (persisted, version) => {
        if (version === 0) {
          const old = persisted as
            | { nodes?: CanvasNode[]; edges?: CanvasEdge[] }
            | undefined;
          if (old && Array.isArray(old.nodes)) {
            const t = Date.now();
            const proj: CanvasProject = {
              id: cid("proj"),
              name: DEFAULT_NAME,
              nodes: old.nodes,
              edges: Array.isArray(old.edges) ? old.edges : [],
              createdAt: t,
              updatedAt: t,
            };
            return { activeId: proj.id, projects: [proj] } as unknown as CanvasState;
          }
        }
        return persisted as CanvasState;
      },
      // rehydrate 后用活动项目重建顶层 nodes/edges 镜像；兜底保证至少一个项目。
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<CanvasState>) } as CanvasState;
        if (!Array.isArray(merged.projects) || merged.projects.length === 0) {
          const proj = makeProject(DEFAULT_NAME);
          merged.projects = [proj];
          merged.activeId = proj.id;
        }
        const active =
          merged.projects.find((x) => x.id === merged.activeId) || merged.projects[0];
        merged.activeId = active.id;
        merged.nodes = active.nodes;
        merged.edges = active.edges;
        merged.groups = active.groups ?? [];
        return merged;
      },
    }
  )
);
