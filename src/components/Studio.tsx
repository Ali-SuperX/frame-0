"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import { toast as pushToast, confirmDialog } from "@/components/ui/Dialog";
import { useLocale } from "next-intl";
import {
  useStudioStore,
  type Job,
  type JobMedia,
} from "@/lib/store";
import { useR2VStore } from "@/lib/r2v/projectStore";
import type { Reference } from "@/lib/r2v/schema";
import { readLocalFile } from "@/lib/editor/localFiles";
import {
  MODELS,
  getModel,
  isImageMode,
  defaultModelForMode,
  type Mode,
} from "@/lib/bailian/models";
import { type Starter } from "@/lib/bailian/starters";
import LocaleSwitcher from "./LocaleSwitcher";
import OmniComposer from "./studio/composer/OmniComposer";
import LazyVideoThumb from "./studio/LazyVideoThumb";
import JobImage from "./studio/JobImage";
import { useRouter } from "next/navigation";
import { uploadMediaFile } from "./studio/uploadMedia";
import dynamic from "next/dynamic";

// 首屏核心路径只需要 job 列表 + prompt 输入 —— 以下组件在用户与特定区域
// 交互时才真正需要，延迟加载可让首屏 JS bundle 减少 ~80KB (gzip)。
const PaneDivider = dynamic(() => import("./studio/PaneDivider"), {
  ssr: false,
});
const PreviewPanel = dynamic(() => import("./studio/PreviewPanel"), {
  ssr: false,
});

const PromptLibrary = dynamic(() => import("./studio/PromptLibrary"), {
  ssr: false,
});
const ShortcutsHelp = dynamic(() => import("./studio/ShortcutsHelp"), {
  ssr: false,
});
const CommandPalette = dynamic(() => import("./studio/CommandPalette"), {
  ssr: false,
});
const FirstRunTour = dynamic(() => import("./studio/FirstRunTour"), {
  ssr: false,
});
const SettingsModal = dynamic(() => import("./studio/SettingsModal"), {
  ssr: false,
});
const DropTargets = dynamic(() => import("./studio/DropTargets"), {
  ssr: false,
});
import { RunningBadge } from "./studio/ChromeExtras";
import {
  ago,
  colorFromGroupId,
  expandPromptTemplate,
  newGroupId as groupId,
  overlapParams,
  STATUS_COLOR,
} from "./studio/helpers";
import { useJobPolling } from "@/lib/bailian/useJobPolling";
import { useLocalJobRehydration } from "@/lib/bailian/useLocalJobRehydration";
import { useJobAutoBackup } from "@/lib/bailian/useJobAutoBackup";
import { useLocalVideoRecovery } from "@/lib/bailian/useLocalVideoRecovery";
import { useStateBackup } from "@/lib/bailian/useStateBackup";
import {
  useJobNotifications,
  requestNotifyPermission,
} from "@/lib/bailian/useJobNotifications";
import { submitJobRequest } from "@/lib/bailian/submitJob";
import { estimateCostFen, applyDiscount } from "@/lib/bailian/cost";
import "@/styles/frame.css";
import "@/styles/studio-composer.css";

export default function Studio({ initialJobId }: { initialJobId?: string }) {
  const locale = useLocale();
  const zh = locale === "zh";
  const homeHref = zh ? "/" : "/en";
  const helpHref = zh ? "/help" : "/en/help";

  const jobs = useStudioStore((s) => s.jobs);
  const draft = useStudioStore((s) => s.draft);
  const activeJobId = useStudioStore((s) => s.activeJobId);
  const compareSet = useStudioStore((s) => s.compareSet);

  const setMode = useStudioStore((s) => s.setMode);
  const setModelId = useStudioStore((s) => s.setModelId);
  const setParam = useStudioStore((s) => s.setParam);
  const setPrompt = useStudioStore((s) => s.setPrompt);
  const setNegativePrompt = useStudioStore((s) => s.setNegativePrompt);
  const setMedia = useStudioStore((s) => s.setMedia);
  const resetDraft = useStudioStore((s) => s.resetDraft);
  const loadJobIntoDraft = useStudioStore((s) => s.loadJobIntoDraft);
  const pendingReuse = useStudioStore((s) => s.pendingReuse);
  const setPendingReuse = useStudioStore((s) => s.setPendingReuse);
  const createJobFromDraft = useStudioStore((s) => s.createJobFromDraft);
  const setJobStatus = useStudioStore((s) => s.setJobStatus);
  const deleteJob = useStudioStore((s) => s.deleteJob);
  const selectJob = useStudioStore((s) => s.selectJob);
  const togglePublish = useStudioStore((s) => s.togglePublish);
  const toggleCompare = useStudioStore((s) => s.toggleCompare);

  const activeJob = useMemo(
    () => jobs.find((j) => j.id === activeJobId),
    [jobs, activeJobId]
  );

  /* ── URL ↔ activeJobId 双向同步 ── */
  const suppressUrlSync = useRef(false);
  const initialJobConsumed = useRef(false);
  const prevActiveRef = useRef(activeJobId);

  // mount 时：URL 带 jobId → 等 hydrate 完成后选中对应 job（不存在则降级）
  useEffect(() => {
    if (initialJobConsumed.current || !initialJobId) return;
    function apply() {
      if (initialJobConsumed.current) return;
      initialJobConsumed.current = true;
      const exists = useStudioStore.getState().jobs.some((j) => j.id === initialJobId);
      if (exists) {
        suppressUrlSync.current = true;
        selectJob(initialJobId);
      } else {
        suppressUrlSync.current = true;
        selectJob(undefined);
        const base = locale === "zh" ? "/studio" : "/en/studio";
        window.history.replaceState(null, "", base);
      }
    }
    if (useStudioStore.persist.hasHydrated()) {
      apply();
    } else {
      return useStudioStore.persist.onFinishHydration(apply);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // activeJobId 变化 → pushState 更新 URL（支持浏览器后退）
  // popstate / initialJobId 触发的变化设 suppressUrlSync 跳过，避免死循环
  useEffect(() => {
    if (prevActiveRef.current === activeJobId) return;
    prevActiveRef.current = activeJobId;
    if (suppressUrlSync.current) {
      suppressUrlSync.current = false;
      return;
    }
    const base = locale === "zh" ? "/studio" : "/en/studio";
    const target = activeJobId ? `${base}/${activeJobId}` : base;
    if (window.location.pathname !== target) {
      window.history.pushState(null, "", target);
    }
  }, [activeJobId, locale]);

  // 浏览器前进/后退 → 从 pathname 解析 jobId 并 selectJob
  useEffect(() => {
    function onPop() {
      const seg = window.location.pathname.split("/studio/")[1];
      const id = seg?.split("/")[0] || undefined;
      suppressUrlSync.current = true;
      selectJob(id);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [selectJob]);

  const currentSpec = useMemo(() => getModel(draft.modelId), [draft.modelId]);

  /* 当前轨：t2i/i2i 属图片轨，其余（t2v/i2v/r2v/ve）属视频轨 */
  const isImageTrack = draft.mode === "t2i" || draft.mode === "i2i";

  /* 提交前缺失的必填项 —— 生成按钮智能禁用 + handleSubmit 共用 */
  const missingFields = useMemo<string[]>(() => {
    if (!currentSpec) return [];
    const m: string[] = [];
    for (const f of currentSpec.fields) {
      if (f.kind === "media" && f.required) {
        const v = draft.media[f.key as keyof typeof draft.media];
        if (!v || (Array.isArray(v) && !v.length)) m.push(f.label);
      }
    }
    if (
      currentSpec.fields.some((f) => f.key === "prompt") &&
      !draft.prompt.trim() &&
      currentSpec.mode !== "i2v"
    ) {
      m.push(zh ? "提示词" : "Prompt");
    }
    return m;
    // 细粒度 deps(draft.media + draft.prompt)已声明,不需要整个 draft —
    // draft 其他字段(history/params 等)变化不应触发 missingFields 重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSpec, draft.media, draft.prompt, zh]);

  /* ───── Prompt library ───── */
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const apiKeys = useStudioStore((s) => s.apiKeys);
  /**
   * key 检测必须等 zustand persist 异步 hydrate 完成 —— 首屏 apiKeys 还是
   * 初始空对象，过早判断会把已配置 key 的用户误判成「未配置」而错误引导。
   * hydrate 未完成时按「已配置」乐观处理：宁可晚几十毫秒引导，也绝不误拦。
   */
  const [keysHydrated, setKeysHydrated] = useState(() =>
    useStudioStore.persist.hasHydrated()
  );
  useEffect(() => {
    if (keysHydrated) return;
    if (useStudioStore.persist.hasHydrated()) {
      setKeysHydrated(true);
      return;
    }
    return useStudioStore.persist.onFinishHydration(() =>
      setKeysHydrated(true)
    );
  }, [keysHydrated]);
  // 服务端是否已配置 key（私有部署 / .env.local）—— 有的话客户端不必再填
  const [hasServerKey, setHasServerKey] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/bailian/key-status")
      .then((r) => r.json())
      .then((j) => {
        if (alive) setHasServerKey(!!j.hasServerKey);
      })
      .catch(() => {
        /* 拿不到就按需用户 key，不影响原逻辑 */
      });
    return () => {
      alive = false;
    };
  }, []);
  const needsKey =
    keysHydrated && !apiKeys.DASHSCOPE_API_KEY?.trim() && !hasServerKey;

  /** 导演台路由（独立页 /director）。R2V 自己的 state (projects / drafts / videos)
   *  住在 r2vProjectStore，跨页面共享。未登录用户由 middleware 自动跳 /login。
   *  3 处入口（nav / params-pane / handleSendToDirector）统一走 router.push. */
  const router = useRouter();
  const directorHref = zh ? "/director" : "/en/director";

  /** Pane switcher for small screens — `all` means the 3-col grid (default on desktop). */
  const [activePane, setActivePane] = useState<"jobs" | "preview">("preview");

  /* 影院模式：一键让视频铺满全屏成为绝对焦点 —— 隐藏左栏 / 配方 / 动作 / 底部对话框；
     Esc 退出。只在「有成片可看」时由 stage 内的 ⛶ 触发（见 PreviewPanel）。 */
  const [theater, setTheater] = useState(false);
  useEffect(() => {
    if (!theater) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setTheater(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [theater]);

  /* ───── Jobs filter + search ───── */
  const [jobFilter, setJobFilter] = useState<
    "all" | Mode | "running" | "done" | "error"
  >("all");
  const [jobSearch, setJobSearch] = useState("");
  const filteredJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    return jobs.filter((j) => {
      if (jobFilter === "all") {
        // no-op
      } else if (jobFilter === "running") {
        if (j.status !== "running" && j.status !== "submitting") return false;
      } else if (jobFilter === "done" || jobFilter === "error") {
        if (j.status !== jobFilter) return false;
      } else {
        if (j.mode !== jobFilter) return false;
      }
      if (!q) return true;
      const blob =
        `${j.title} ${j.prompt ?? ""} ${j.modelId}`.toLowerCase();
      return blob.includes(q);
    });
  }, [jobs, jobFilter, jobSearch]);

  /**
   * Apply a starter with a scope:
   *   - "prompt"  → only replace prompt text (keep current model/params/media)
   *   - "params"  → only swap model + params (keep current prompt/media)
   *   - "all"     → full load (model + params + prompt)
   */
  function applyStarter(starter: Starter, scope: "prompt" | "params" | "all") {
    if (scope === "prompt") {
      setPrompt(starter.prompt);
      if (starter.negativePrompt) setNegativePrompt(starter.negativePrompt);
      return;
    }
    // params-only or all: need to switch mode/model, which resets media.
    setMode(starter.mode);
    setModelId(starter.modelId);
    for (const [k, v] of Object.entries(starter.params)) {
      setParam(k, v);
    }
    if (scope === "all") {
      setPrompt(starter.prompt);
      if (starter.negativePrompt) setNegativePrompt(starter.negativePrompt);
    }
  }

  /* ───── Polling + local-file rehydration ───── */
  useJobPolling();
  useLocalJobRehydration();
  useJobAutoBackup();
  useLocalVideoRecovery();
  useStateBackup();
  /* ───── Browser notifications on job completion (hidden-tab users) ───── */
  useJobNotifications();

  const createJobFromPayload = useStudioStore((s) => s.createJobFromPayload);
  const savePromptFromDraft = useStudioStore((s) => s.savePromptFromDraft);
  const paneWidths = useStudioStore((s) => s.paneWidths);
  const setPaneWidth = useStudioStore((s) => s.setPaneWidth);
  const discount = useStudioStore((s) => s.discount);
  const setDiscount = useStudioStore((s) => s.setDiscount);

  /** Estimated cost in fen, with the active promo discount applied. */
  function estCostFen(modelId: string, params: Record<string, unknown>): number {
    return applyDiscount(
      estimateCostFen(
        modelId,
        Number(params.duration),
        String(params.quality_mode ?? ""),
        String(params.resolution ?? "")
      ),
      discount
    );
  }

  // Composer cost readout — list price + discounted final.
  const costRawFen = estimateCostFen(
    draft.modelId,
    Number(draft.params.duration),
    String(draft.params.quality_mode ?? ""),
    String(draft.params.resolution ?? "")
  );
  const costFinalFen = applyDiscount(costRawFen, discount);
  const costDiscounted = discount < 10 && costRawFen > 0;
  /* ───── Pane resize: write CSS var directly during drag (no React rerender) ───── */
  const gridRef = useRef<HTMLElement | null>(null);
  function previewPaneWidth(side: "jobs" | "params", px: number) {
    const el = gridRef.current;
    if (!el) return;
    el.style.setProperty(side === "jobs" ? "--pw-jobs" : "--pw-params", `${px}px`);
  }
  /* Dynamic max widths — keep the preview at least MIN_PREVIEW px wide so
   * the user can never drag a sidebar so far that the video/preview gets
   * squashed. Recomputed on resize. */
  const [vw, setVw] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1920
  );
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const MIN_PREVIEW = 480;
  const DIVIDERS = 12;
  const maxJobs = Math.max(
    260,
    Math.min(600, vw - DIVIDERS - MIN_PREVIEW)
  );

  // Tiny toast for "saved / copied" flashes — shown in the chrome area.
  const [toast, setToast] = useState<string | null>(null);
  function flashToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1600);
  }

  /** Send a job's reference images + prompt to the Director (R2V) workspace for remixing. */
  async function handleSendToDirector(job: Job) {
    const r2v = useR2VStore.getState();
    const locale = zh ? "zh" : "en";
    r2v.startBlankDraft(locale);

    // Collect media entries with their localKey for IDB rehydration
    const mediaEntries: JobMedia[] = [];
    if (job.media.reference_urls) mediaEntries.push(...job.media.reference_urls);
    if (job.media.ref_images) mediaEntries.push(...job.media.ref_images);
    if (mediaEntries.length === 0 && job.media.img_url) mediaEntries.push(job.media.img_url);
    // 图模式（t2i / i2i）的「产出图」本身就是用户想带进导演台的资产。
    // job.media 装的是输入媒体——t2i 输入是文字，所以 mediaEntries 会是空的；
    // 真正的产出图复用 job.videoUrl 字段（schema 不区分图/视频）。
    //
    // 注意：videoUrl 是 session-only blob:（字节在 IDB 通过 localKey 找），DashScope
    // 没法直接 fetch。必须先把字节传到 OSS 拿 oss:// URL，否则 R2V 提交时
    // submitJobRequest 的 blob/data 守卫会抛「媒体未上传到云端」。这里照 handleImageToVideo 做同步上传。
    if (mediaEntries.length === 0 && isImageMode(job.mode) && job.videoUrl) {
      try {
        flashToast(zh ? "正在上传生成图到云端…" : "Uploading generated image…");
        let blob: Blob | null = null;
        if (job.localKey) blob = await readLocalFile(job.localKey);
        if (!blob) {
          const res = await fetch(job.videoUrl);
          if (res.ok) blob = await res.blob();
        }
        if (blob) {
          const mime = job.localMime || blob.type || "image/png";
          const ext = mime.split("/")[1]?.split("+")[0] || "png";
          // Sanitize the candidate filename: strip newlines / control chars and
          // anything that isn't safe for an OSS object key. The server also
          // sanitizes in uploadToOss, but cleaning here keeps multipart
          // filename, IDB metadata, and UI labels consistent.
          const rawTitle = (job.title || "ref").replace(/[\s\r\n]+/g, " ").trim();
          const safeBase =
            rawTitle.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) ||
            "ref";
          const file = new File([blob], `${safeBase}.${ext}`, { type: mime });
          const r2vModel = defaultModelForMode("r2v");
          const uploaded = await uploadMediaFile(file, r2vModel.id);
          mediaEntries.push(uploaded);
        }
      } catch (e) {
        console.error("[handleSendToDirector] image upload failed:", e);
        flashToast(
          (zh ? "图片上传失败：" : "Upload failed: ") +
            (e instanceof Error ? e.message : String(e)).slice(0, 80)
        );
      }
    }

    // 透传持久化字段 —— thumbDataUrl 必须保持 schema 约定（base64 dataURL），
    // 不再用 createObjectURL 伪造一个会随 reload 失效的 blob URL，否则该字段
    // 会污染 IDB / R2V projects，导致下次打开时缩略图全部裂掉。
    // 真正的预览靠 R2V 卡片自己从 localKey 走 IDB rehydrate。
    const references: Reference[] = mediaEntries.map((m, i) => ({
      slot: i + 1,
      url: m.url,
      role: "character" as const,
      name: m.name,
      thumbDataUrl:
        m.thumbDataUrl && !m.thumbDataUrl.startsWith("blob:")
          ? m.thumbDataUrl
          : undefined,
      localKey: m.localKey,
      localPath: m.localPath,
    }));

    const refs = references.length > 0
      ? references
      : [{ slot: 1, url: "" as const, role: "character" as const }];

    // ⚠️ 必须 await：updateInput 内部 zustand set 是同步的，但完整流程包含
    // schema 校验 + 可选的 FSA/IDB 持久化。await 确保「内存 current 已被新值替换」
    // 这件事在 router.push 之前完成，避免 Director 页 mount 时读到旧 draft。
    // 同时记录调用前的 errorMessage,跑完用它来分辨「本次有没有新错误」。
    const errBefore = useR2VStore.getState().errorMessage;
    await r2v.updateInput((prev) => ({
      ...prev,
      title: job.title || prev.title,
      references: refs,
      coreNeed: job.prompt || "",
    }));

    // 失败兜底：updateInput 在 schema 校验失败时会 set errorMessage 而不更新
    // current。我们看本次 updateInput 是不是新引入了 errorMessage —— 是就停手。
    // 注意：不能用 written.references !== refs 比较引用，因为 zod safeParse
    // 会重新构造对象，store 里的 references 永远不是原 refs 的引用。
    const after = useR2VStore.getState();
    if (!after.current) {
      flashToast(zh ? "导演台无可用草稿，请重试" : "No active draft");
      return;
    }
    if (after.errorMessage && after.errorMessage !== errBefore) {
      flashToast(
        zh
          ? `导演台数据校验失败：${after.errorMessage}`
          : `Director schema check failed: ${after.errorMessage}`
      );
      return;
    }

    if (job.prompt) {
      r2v.setPromptManual(job.prompt, job.negativePrompt || undefined);
    }

    router.push(directorHref);
    flashToast(zh ? "已刷入导演台 🎬" : "Sent to Director 🎬");
  }

  /**
   * Turn a finished image (t2i/i2i result) into the first frame of an I2V
   * draft — one click, no manual re-upload. Switches the composer to the
   * default I2V model and drops the image into its `img_url` slot; the draft
   * prompt is preserved so the user can extend it with motion wording.
   *
   * The job's `videoUrl` is usually a session-only `blob:` URL (auto-backup
   * swaps OSS URLs for blob URLs after download). DashScope can't fetch
   * blob:/local URLs, so the actual bytes must be re-uploaded to OSS first —
   * otherwise the I2V submit fails with "Failed to download blob:…".
   */
  async function handleImageToVideo(job: Job) {
    if (!job.videoUrl) return;
    const i2v = defaultModelForMode("i2v");
    // setModelId switches mode → i2v (clearing the now-irrelevant image-mode
    // media) and keeps the prompt; the OSS upload then runs in the background.
    setModelId(i2v.id);
    flashToast(zh ? "正在准备首帧…" : "Preparing first frame…");
    try {
      // Recover the real image bytes — from IDB (localKey) or by fetching the
      // current URL (works for both blob: and http(s): in this document).
      let blob: Blob | null = null;
      if (job.localKey) {
        blob = await readLocalFile(job.localKey);
      }
      if (!blob) {
        const res = await fetch(job.videoUrl);
        if (res.ok) blob = await res.blob();
      }
      if (!blob) throw new Error("no image bytes");
      const mime = job.localMime || blob.type || "image/png";
      const ext = mime.split("/")[1]?.split("+")[0] || "png";
      // Sanitize: strip newlines / non-ASCII so the file.name → multipart →
      // OSS key chain stays consistent (server also sanitizes in uploadToOss).
      const rawTitle = (job.title || "image").replace(/[\s\r\n]+/g, " ").trim();
      const safeBase =
        rawTitle.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) ||
        "image";
      const file = new File([blob], `${safeBase}.${ext}`, { type: mime });
      // Upload to OSS so the I2V payload carries a server-fetchable URL.
      const media = await uploadMediaFile(file, i2v.id);
      setMedia({ img_url: media });
      flashToast(zh ? "已设为图生视频首帧 🎞 写运动描述即可生成" : "Set as I2V first frame 🎞");
    } catch (e) {
      // 把真实错误透传给用户 —— 之前静默吞掉导致"按钮不能点又没提示"
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[handleImageToVideo] failed:", e);
      flashToast(
        (zh ? "图片处理失败：" : "Failed: ") + msg.slice(0, 100)
      );
    }
  }

  /**
   * Send a finished video into the Video-Edit (ve) composer as the source
   * video — one click, no manual re-upload. Mirrors handleImageToVideo: the
   * job's videoUrl is usually a session-only blob: URL, so the bytes are
   * recovered (IDB or fetch) and re-uploaded to OSS for a fetchable source URL.
   * The draft prompt is cleared — ve's prompt is an edit instruction, not the
   * source video's generation prompt.
   */
  async function handleVideoToEdit(job: Job) {
    if (!job.videoUrl) return;
    const ve = defaultModelForMode("ve");
    setModelId(ve.id);
    setPrompt("");
    flashToast(zh ? "正在准备源视频…" : "Preparing source video…");
    try {
      let blob: Blob | null = null;
      if (job.localKey) {
        blob = await readLocalFile(job.localKey);
      }
      if (!blob) {
        const res = await fetch(job.videoUrl);
        if (res.ok) blob = await res.blob();
      }
      if (!blob) throw new Error("no video bytes");
      const mime = job.localMime || blob.type || "video/mp4";
      const ext = mime.split("/")[1]?.split(";")[0] || "mp4";
      const file = new File(
        [blob],
        `${(job.title || "video").slice(0, 40)}.${ext}`,
        { type: mime }
      );
      // Upload to OSS so the Video-Edit payload carries a fetchable source URL.
      const media = await uploadMediaFile(file, ve.id);
      setMedia({ video_url: media });
      flashToast(
        zh ? "已载入视频编辑 ✂ 写编辑指令即可生成" : "Loaded into Video Edit ✂"
      );
    } catch {
      flashToast(
        zh ? "视频处理失败，请在源视频处手动上传" : "Failed — upload the source video manually"
      );
    }
  }

  /* 资产库「送去工坊」落地：跳转到 /studio 后消费一次性 pendingReuse 信号，
     执行对应复用 handler（rerun 载参数 / i2v 设首帧 / ve 设源视频）。 */
  useEffect(() => {
    if (!pendingReuse) return;
    const job = jobs.find((j) => j.id === pendingReuse.jobId);
    const action = pendingReuse.action;
    setPendingReuse(undefined); // 一次性消费，避免重复执行
    if (!job) return;
    if (action === "rerun") loadJobIntoDraft(job.id);
    else if (action === "i2v") void handleImageToVideo(job);
    else if (action === "ve") void handleVideoToEdit(job);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingReuse]);

  function handleSavePrompt() {
    if (!draft.prompt.trim()) return;
    savePromptFromDraft({ withParams: true });
    flashToast(zh ? "已收藏到我的库 ⭐" : "Saved to your library ⭐");
  }

  /** Apply a SavedPrompt entry with the selected scope. */
  function applySavedPrompt(
    saved: import("@/lib/store").SavedPrompt,
    scope: "prompt" | "params" | "all"
  ) {
    if (scope === "prompt") {
      setPrompt(saved.prompt);
      if (saved.negativePrompt) setNegativePrompt(saved.negativePrompt);
      return;
    }
    // params or all: switch model first if saved has one
    if (saved.modelId) setModelId(saved.modelId);
    if (saved.params) {
      for (const [k, v] of Object.entries(saved.params)) setParam(k, v);
    }
    if (scope === "all") {
      setPrompt(saved.prompt);
      if (saved.negativePrompt) setNegativePrompt(saved.negativePrompt);
    }
  }

  /* ───── Submit handler ───── */
  async function handleSubmit() {
    if (!currentSpec) return;
    if (needsKey) {
      pushToast(
        zh
          ? "请先在「设置 ⚙」中填写 API Key 再生成"
          : "Add your API Key in Settings ⚙ before generating"
      );
      setSettingsOpen(true);
      return;
    }
    if (missingFields.length) {
      pushToast(
        (zh ? "还缺：" : "Missing: ") + missingFields.join(zh ? "、" : ", "),
        "error"
      );
      return;
    }

    void requestNotifyPermission();

    // Template expansion: if the prompt contains `{a|b|c}` placeholders,
    // we fan out one job per combination (capped at 8) and group them.
    const expansions = expandPromptTemplate(draft.prompt);
    if (expansions.length > 1) {
      return handleTemplateBatch(expansions);
    }

    const costFen = estCostFen(draft.modelId, draft.params);
    const jobId = createJobFromDraft();
    setJobStatus(jobId, { costFen });
    try {
      const { taskId, imageUrls } = await submitJobRequest({
        modelId: draft.modelId,
        params: draft.params,
        media: draft.media,
        prompt: draft.prompt,
        negativePrompt: draft.negativePrompt,
      });
      if (imageUrls?.length) {
        // 图片同步完成 —— 直接 done（结果 URL 复用 videoUrl 字段存放）。
        setJobStatus(jobId, {
          status: "done",
          videoUrl: imageUrls[0],
          completedAt: Date.now(),
        });
      } else if (taskId) {
        setJobStatus(jobId, { taskId, status: "running" });
      }
    } catch (e) {
      setJobStatus(jobId, {
        status: "error",
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /* ───── Template batch: one prompt template → N jobs ───── */
  async function handleTemplateBatch(expansions: string[]) {
    if (!currentSpec) return;
    const gid = groupId();
    const label = `模板 ×${expansions.length}`;
    const toggle = useStudioStore.getState().toggleCompare;
    const cost = estCostFen(draft.modelId, draft.params);
    for (const prompt of expansions) {
      const jobId = createJobFromPayload({
        modelId: draft.modelId,
        mode: draft.mode,
        params: { ...draft.params },
        media: draft.media,
        prompt,
        negativePrompt: draft.negativePrompt,
        title: `[⋯] ${prompt}`.slice(0, 60),
      });
      setJobStatus(jobId, { groupId: gid, groupLabel: label, costFen: cost });
      toggle(jobId);
      submitJobRequest({
        modelId: draft.modelId,
        params: draft.params,
        media: draft.media,
        prompt,
        negativePrompt: draft.negativePrompt,
      })
        .then(({ taskId }) =>
          setJobStatus(jobId, { taskId, status: "running" })
        )
        .catch((e) =>
          setJobStatus(jobId, {
            status: "error",
            errorMessage: e instanceof Error ? e.message : String(e),
          })
        );
    }
  }

  /* ───── Seed batch: same prompt/model, N different random seeds ───── */
  async function handleSeedBatch(count: number = 4) {
    if (!currentSpec) return;
    if (!draft.prompt.trim()) {
      pushToast(zh ? "先填一个 prompt" : "Write a prompt first", "error");
      return;
    }
    const gid = groupId();
    const label = `Seed ×${count}`;
    const toggle = useStudioStore.getState().toggleCompare;
    const cost = estCostFen(draft.modelId, draft.params);
    for (let i = 0; i < count; i++) {
      const seed = Math.floor(Math.random() * 1_000_000);
      const params = { ...draft.params, seed };
      const jobId = createJobFromPayload({
        modelId: draft.modelId,
        mode: draft.mode,
        params,
        media: draft.media,
        prompt: draft.prompt,
        negativePrompt: draft.negativePrompt,
        title: `[🎲 ${seed}] ${draft.prompt || currentSpec.displayName}`.slice(0, 60),
      });
      setJobStatus(jobId, { groupId: gid, groupLabel: label, costFen: cost });
      toggle(jobId);
      submitJobRequest({
        modelId: draft.modelId,
        params,
        media: draft.media,
        prompt: draft.prompt,
        negativePrompt: draft.negativePrompt,
      })
        .then(({ taskId }) =>
          setJobStatus(jobId, { taskId, status: "running" })
        )
        .catch((e) =>
          setJobStatus(jobId, {
            status: "error",
            errorMessage: e instanceof Error ? e.message : String(e),
          })
        );
    }
  }

  /* ───── Retry a failed job ───── */
  async function handleRetry(jobId: string) {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    // Reset the existing row in-place so history doesn't explode.
    setJobStatus(jobId, {
      status: "submitting",
      errorMessage: undefined,
      taskId: undefined,
      videoUrl: undefined,
      completedAt: undefined,
      createdAt: Date.now(),
    });
    try {
      const { taskId } = await submitJobRequest({
        modelId: job.modelId,
        params: job.params,
        media: job.media,
        prompt: job.prompt,
        negativePrompt: job.negativePrompt,
      });
      setJobStatus(jobId, { taskId, status: "running" });
    } catch (e) {
      setJobStatus(jobId, {
        status: "error",
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /* ───── Fan-out: submit current draft to 3 models in the same mode ───── */
  async function handleFanOut() {
    if (!currentSpec) return;
    if (!draft.prompt.trim()) {
      pushToast(zh ? "先填一个 prompt" : "Write a prompt first", "error");
      return;
    }
    // Pick up to 3 sibling models in the same mode, skipping identical IDs.
    const siblings = MODELS.filter((m) => m.mode === draft.mode).slice(0, 3);
    if (siblings.length < 2) {
      pushToast(zh ? "当前模式可选模型不足 2 个" : "Not enough sibling models", "error");
      return;
    }
    const toggle = useStudioStore.getState().toggleCompare;
    const gid = groupId();
    const label = `Fan-out ×${siblings.length}`;
    for (const spec of siblings) {
      // Merge shared fields into each model's defaults so the call stays valid
      // even if some params don't apply.
      const params = { ...spec.defaults, ...overlapParams(draft.params, spec.id) };
      const cost = estCostFen(spec.id, params);
      const jobId = createJobFromPayload({
        modelId: spec.id,
        mode: spec.mode,
        params,
        media: draft.media,
        prompt: draft.prompt,
        negativePrompt: draft.negativePrompt,
        title: `[⚡ ${spec.displayName}] ${draft.prompt || spec.displayName}`.slice(0, 60),
      });
      setJobStatus(jobId, { groupId: gid, groupLabel: label, costFen: cost });
      toggle(jobId); // auto-add to compare
      // Fire submits in parallel (don't await sequentially).
      submitJobRequest({
        modelId: spec.id,
        params,
        media: draft.media,
        prompt: draft.prompt,
        negativePrompt: draft.negativePrompt,
      })
        .then(({ taskId }) =>
          setJobStatus(jobId, { taskId, status: "running" })
        )
        .catch((e) =>
          setJobStatus(jobId, {
            status: "error",
            errorMessage: e instanceof Error ? e.message : String(e),
          })
        );
    }
  }


  /* ───── Keyboard shortcuts ───── */
  // Refs so the keyboard handler always reads the latest draft without re-registering.
  // Sync via effect (not render) — React 19 strict `react-hooks/refs` rule
  // forbids ref writes during render. effect with no deps runs after every render.
  const submitRef = useRef<() => Promise<void>>(async () => {});
  const saveRef = useRef<() => void>(() => {});
  useEffect(() => {
    submitRef.current = handleSubmit;
    saveRef.current = handleSavePrompt;
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inTextField =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      // Cmd/Ctrl modifier keys work anywhere.
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        if (libraryOpen || shortcutsOpen) return;
        e.preventDefault();
        void submitRef.current();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        // Undo last reversible action (delete job / publish / clear compare).
        e.preventDefault();
        const st = useStudioStore.getState();
        const last = st.popUndo();
        if (!last) {
          flashToast(zh ? "无可撤销" : "Nothing to undo");
          return;
        }
        if (last.kind === "delete-job") {
          st.createJobFromPayload({
            modelId: last.job.modelId,
            mode: last.job.mode,
            params: last.job.params,
            media: last.job.media,
            prompt: last.job.prompt,
            negativePrompt: last.job.negativePrompt,
            title: last.job.title,
          });
          flashToast(zh ? "已恢复任务" : "Job restored");
        } else if (last.kind === "toggle-publish") {
          st.togglePublish(last.jobId);
          // Note: togglePublish pushes its own undo; pop that too so it's a net revert.
          st.popUndo();
          flashToast(zh ? "已撤销发布变更" : "Publish reverted");
        } else if (last.kind === "clear-compare") {
          for (const id of last.prev) st.toggleCompare(id);
          flashToast(zh ? "对比台已恢复" : "Compare restored");
        }
        return;
      }

      // Single-key shortcuts: skip if user is typing.
      if (inTextField) return;

      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
      if (e.key === "/") {
        // Don't intercept the browser's find shortcut (Ctrl+F); only bare `/`.
        e.preventDefault();
        setLibraryOpen(true);
        return;
      }
      if (e.key === "Escape") {
        if (shortcutsOpen) setShortcutsOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // zh 进 deps:onKey 内 Cmd+Z 的 toast 文案("无可撤销" / "Nothing to undo")随语言变,
    // 切语言后需要重新注册 listener 让闭包拿到最新 zh
  }, [libraryOpen, shortcutsOpen, zh]);

  return (
    <div className={`app studio-app${theater ? " theater" : ""}`}>
      {/* 暗房安全灯氛围 —— 顶部暖琥珀柔光 + 角落暗角，像一间被安全灯笼罩的暗房 */}
      <div className="studio-safelight" aria-hidden />
      {/* Chrome */}
      <header className="chrome">
        <div className="left">
          <Link href={homeHref} className="logo-link">
            <div className="logo">
              Frame<span style={{ color: "var(--accent)" }}>/</span>0{" "}
              <b>STUDIO</b>
            </div>
          </Link>
        </div>
        <TopNav current="studio" />
        <div className="right">
          <Link prefetch={false} href={helpHref} className="chrome-icon" title={zh ? "帮助" : "Help"} style={{ textDecoration: "none" }}>?</Link>
          <button
            type="button"
            className="chrome-icon"
            onClick={() => {
              // Cycle jobs sidebar:  min(200) → default(280) → wide(500) → min …
              const cur = paneWidths.jobs;
              const next = cur < 240 ? 280 : cur < 380 ? 500 : 200;
              setPaneWidth("jobs", next);
            }}
            title={zh ? "切换左侧任务栏宽度" : "Cycle left sidebar width"}
            aria-label="toggle jobs sidebar"
          >
            ⇤
          </button>
          <LocaleSwitcher />
          <button
            type="button"
            className="chrome-icon"
            onClick={() => setSettingsOpen(true)}
            title={zh ? "API 密钥设置" : "API key settings"}
            aria-label="settings"
          >
            ⚙
          </button>
          <RunningBadge
            jobs={jobs}
            zh={zh}
            hasKey={!needsKey}
            onConfigure={() => setSettingsOpen(true)}
          />
        </div>
      </header>

      {/* Tab switcher — visible only on small screens */}
      <div className="pane-tabs" role="tablist">
        <button
          type="button"
          className={`pane-tab${activePane === "jobs" ? " on" : ""}`}
          onClick={() => setActivePane("jobs")}
        >
          {zh ? "任务" : "Jobs"}
          {jobs.length > 0 && <span className="pane-tab-num">{jobs.length}</span>}
        </button>
        <button
          type="button"
          className={`pane-tab${activePane === "preview" ? " on" : ""}`}
          onClick={() => setActivePane("preview")}
        >
          {zh ? "预览" : "Preview"}
        </button>
      </div>

      {/* Main 3-column layout (with resizable sidebars on desktop) */}
      <section
        className="studio-grid"
        data-active-pane={activePane}
        ref={gridRef}
        style={
          {
            "--pw-jobs": `${paneWidths.jobs}px`,
          } as React.CSSProperties
        }
      >
        {/* LEFT: Jobs history */}
        <aside className="jobs-pane">
          <div className="jobs-head">
            <span className="jobs-title">{zh ? "历史任务" : "Jobs"}</span>
            <span className="jobs-count">
              {jobFilter !== "all" || jobSearch ? (
                <>
                  {filteredJobs.length}/{jobs.length}
                </>
              ) : (
                jobs.length
              )}
            </span>
          </div>
          {jobs.length > 0 && (
            <div className="jobs-toolbar">
              <div className="jobs-chips" role="tablist">
                {(
                  [
                    ["all", zh ? "全部" : "All"],
                    ["running", zh ? "生成中" : "Generating"],
                    ["done", zh ? "成片" : "Footage"],
                    ["error", zh ? "废片" : "Failed"],
                    ["t2v", "T2V"],
                    ["i2v", "I2V"],
                    ["r2v", "R2V"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={`jobs-chip${jobFilter === k ? " on" : ""}`}
                    onClick={() => setJobFilter(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                className="jobs-search"
                placeholder={zh ? "搜索 prompt / 模型" : "search prompt / model"}
                value={jobSearch}
                onChange={(e) => setJobSearch(e.target.value)}
              />
            </div>
          )}
          <div className="jobs-list">
            {jobs.length === 0 ? (
              <div className="jobs-empty">
                {zh
                  ? "还没有任务。选择模型、填写 prompt，然后点提交。"
                  : "No jobs yet. Pick a model, write a prompt, and submit."}
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="jobs-empty">
                {zh ? "没有匹配的任务。" : "No jobs match filter."}
                <button
                  type="button"
                  className="jobs-reset"
                  onClick={() => {
                    setJobFilter("all");
                    setJobSearch("");
                  }}
                >
                  {zh ? "清空筛选" : "Reset filter"}
                </button>
              </div>
            ) : (
              filteredJobs.map((j) => (
                <div
                  key={j.id}
                  className={`job-item${j.id === activeJobId ? " active" : ""}${
                    j.status === "done" && j.videoUrl ? " draggable" : ""
                  }${j.groupId ? " grouped" : ""}`}
                  onClick={() => {
                    selectJob(j.id);
                    // Auto-load this job's params into the draft so the right
                    // panel shows its full settings (model + prompt + media).
                    loadJobIntoDraft(j.id);
                  }}
                  draggable={j.status === "done" && !!j.videoUrl}
                  onDragStart={(e) => {
                    if (j.status !== "done" || !j.videoUrl) return;
                    e.dataTransfer.effectAllowed = "copyMove";
                    e.dataTransfer.setData("application/x-frame0-job", j.id);
                    e.dataTransfer.setData("text/plain", j.videoUrl);
                    document.body.setAttribute("data-job-dragging", "true");
                  }}
                  onDragEnd={() => {
                    document.body.removeAttribute("data-job-dragging");
                  }}
                  title={j.groupLabel}
                  data-group-id={j.groupId}
                >
                  {j.groupId && (
                    <div
                      className="job-group-bar"
                      style={{
                        background: colorFromGroupId(j.groupId),
                      }}
                    />
                  )}
                  <div className="job-thumb">
                    {j.status === "done" && j.videoUrl ? (
                      isImageMode(j.mode) ? (
                        <JobImage
                          src={j.videoUrl}
                          alt=""
                          localKey={j.localKey}
                        />
                      ) : (
                        <LazyVideoThumb src={j.videoUrl} />
                      )
                    ) : j.media.img_url?.previewUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={j.media.img_url.previewUrl} alt="" />
                    ) : (
                      <div className="job-thumb-ph">
                        {j.status === "running" || j.status === "submitting" ? (
                          <span className="job-pulse-dot" />
                        ) : (
                          <span>{j.mode.toUpperCase()}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="job-meta">
                    <div className="job-title">{j.title}</div>
                    <div className="job-sub">
                      <span className="job-mode">{j.mode.toUpperCase()}</span>
                      <span className="job-model" title={j.modelId}>
                        {j.modelId.split("/").pop()}
                      </span>
                      <span
                        className="job-status"
                        style={{ color: STATUS_COLOR[j.status] }}
                      >
                        {((zh
                          ? { submitting: "入槽", running: "生成中", done: "成片", error: "废片", canceled: "弃显", draft: "草稿" }
                          : { submitting: "LOADING", running: "GENERATING", done: "FOOTAGE", error: "FAILED", canceled: "CANCELED", draft: "DRAFT" }
                        ) as Record<string, string>)[j.status] ?? j.status.toUpperCase()}
                      </span>
                      <span className="job-time">{ago(j.createdAt)}</span>
                    </div>
                  </div>
                  <div className="job-actions">
                    {j.status === "error" && (
                      <button
                        type="button"
                        title={zh ? "重试（保留参数）" : "Retry"}
                        className="job-retry"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleRetry(j.id);
                        }}
                      >
                        ↻
                      </button>
                    )}
                    <button
                      type="button"
                      title={
                        compareSet.includes(j.id)
                          ? "Remove from compare"
                          : "Add to compare"
                      }
                      className={`job-pin${compareSet.includes(j.id) ? " on" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCompare(j.id);
                      }}
                    >
                      ⇌
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      className="job-del"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (
                          await confirmDialog({
                            title: zh ? "删除这条任务？" : "Delete this job?",
                            danger: true,
                          })
                        )
                          deleteJob(j.id);
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        <PaneDivider
          side="left"
          value={paneWidths.jobs}
          min={200}
          max={maxJobs}
          ariaLabel="resize jobs sidebar"
          onPreview={(px) => previewPaneWidth("jobs", px)}
          onCommit={(px) => setPaneWidth("jobs", px)}
        />

        {/* CENTER: Preview */}
        <main className="preview-pane">
          {/* Drop zones — visible only while a job is being dragged (CSS-driven) */}
          <DropTargets
            zh={zh}
            onDropCompare={(jobId) => {
              // If not already compared, add it; else bump to Compare directly.
              if (!compareSet.includes(jobId)) toggleCompare(jobId);
              flashToast(zh ? "已加入对比台 ⇌" : "Added to compare ⇌");
            }}
          />
          <PreviewPanel
            job={activeJob}
            zh={zh}
            onRerun={() =>
              activeJob && loadJobIntoDraft(activeJob.id)
            }
            onPublish={() => activeJob && togglePublish(activeJob.id)}
            onRetry={() => activeJob && void handleRetry(activeJob.id)}
            hasJobs={jobs.length > 0}
            onOpenLibrary={() => setLibraryOpen(true)}
            onSendToDirector={handleSendToDirector}
            onImageToVideo={handleImageToVideo}
            onEditVideo={handleVideoToEdit}
            theater={theater}
            onToggleTheater={() => setTheater((v) => !v)}
          />
        </main>
      </section>

      <OmniComposer
        zh={zh}
        directorHref={directorHref}
        currentSpec={currentSpec}
        missingFields={missingFields}
        costRawFen={costRawFen}
        costFinalFen={costFinalFen}
        costDiscounted={costDiscounted}
        onSubmit={() => void handleSubmit()}
        onSave={handleSavePrompt}
        onOpenLibrary={() => setLibraryOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        flashToast={flashToast}
      />

      {/* Prompt library overlay */}
      <PromptLibrary
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        currentMode={draft.mode}
        zh={zh}
        onApply={applyStarter}
        onApplySaved={applySavedPrompt}
      />

      {/* Keyboard shortcuts help — toggle with `?` */}
      <ShortcutsHelp
        open={shortcutsOpen}
        zh={zh}
        onClose={() => setShortcutsOpen(false)}
      />

      {/* Global command palette — ⌘+K */}
      <CommandPalette
        open={paletteOpen}
        zh={zh}
        onClose={() => setPaletteOpen(false)}
        onAction={(kind) => {
          if (kind === "submit") void handleSubmit();
          else if (kind === "save") handleSavePrompt();
          else if (kind === "reset") resetDraft();
          else if (kind === "settings") setSettingsOpen(true);
        }}
      />

      {/* First-visit welcome card (dismiss forever) */}
      <FirstRunTour zh={zh} />

      {/* API key settings modal */}
      <SettingsModal
        open={settingsOpen}
        zh={zh}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Global toast (save confirmation, etc.) */}
      {toast && <div className="studio-toast">{toast}</div>}

      <style jsx global>{`
        .studio-app {
          height: 100vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        /* 暗房安全灯氛围层 —— fixed 覆盖，pointer-events:none，不挡任何交互 */
        .studio-safelight {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 5;
        }
        /* 顶部安全灯暖光：screen 叠加只加光不压暗，集中顶部、不碰中央视频 */
        .studio-safelight::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(
            85% 48% at 50% -6%,
            color-mix(in oklab, var(--accent) 14%, transparent) 0%,
            transparent 56%
          );
          mix-blend-mode: screen;
        }
        /* 暗房角落暗角：越往边缘越深，把视线聚到中央 */
        .studio-safelight::after {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(
            125% 92% at 50% 42%,
            transparent 58%,
            rgba(0, 0, 0, 0.42) 100%
          );
        }

        .chrome-icon {
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper-mute);
          width: 30px;
          height: 26px;
          font-size: 14px;
          line-height: 1;
          cursor: pointer;
          border-radius: 2px;
          font-family: var(--font-mono);
          padding: 0;
          transition: all 0.15s;
        }
        .chrome-icon:hover {
          color: var(--accent);
          border-color: var(--accent);
        }

        .logo-link {
          text-decoration: none;
          color: inherit;
        }

        .studio-grid {
          flex: 1;
          display: grid;
          /* 3 tracks: jobs-pane | divider | preview。
             composer 已改为底部浮动框，右侧 params 栏移除。
             minmax(0, 1fr) 让 preview 可收缩，不被撑爆视口。 */
          grid-template-columns:
            var(--pw-jobs, 280px)
            auto
            minmax(0, 1fr);
          background: var(--line);
          /* Leave room for the fixed top chrome (~65px) and clamp height to
             the remaining viewport so the preview / params don't overflow. */
          margin-top: 65px;
          height: calc(100vh - 65px);
          width: 100%;
          min-height: 0;
          overflow: hidden;
        }

        .jobs-pane {
          background: var(--ink);
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .preview-pane {
          background: var(--ink);
          display: flex;
          flex-direction: column;
          min-height: 0;
          /* 给底部浮动 composer 让出空间 —— --oc-height 由 OmniComposer 实测写入 */
          /* dock 浮在 bottom:20px 处，padding 必须 = oc 高 + 20(偏移) + 舒适间距，
             否则动作行/recipe 会贴死甚至被 dock 盖住。+56 给 ~36px 安全间距。 */
          padding-bottom: calc(var(--oc-height, 132px) + 56px);
        }

        /* ─── Tab switcher (visible <1100px) ─── */
        .pane-tabs {
          display: none;
          border-bottom: 1px solid var(--line);
          background: var(--ink);
        }
        .pane-tab {
          flex: 1;
          padding: 12px 10px;
          background: transparent;
          border: none;
          border-right: 1px solid var(--line);
          color: var(--paper-mute);
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .pane-tab:last-child {
          border-right: none;
        }
        .pane-tab.on {
          color: var(--accent);
          background: var(--ink-2);
          box-shadow: inset 0 -2px 0 var(--accent);
        }
        .pane-tab-num {
          padding: 1px 6px;
          background: color-mix(in oklab, var(--accent) 30%, transparent);
          color: var(--accent);
          border-radius: 8px;
          font-size: 9px;
        }

        @media (max-width: 1100px) {
          .pane-tabs {
            display: flex;
          }
          .studio-grid {
            grid-template-columns: 1fr;
            grid-template-rows: 1fr;
          }
          .studio-grid > .jobs-pane,
          .studio-grid > .preview-pane {
            display: none;
            grid-column: 1;
            grid-row: 1;
          }
          .studio-grid[data-active-pane="jobs"] > .jobs-pane {
            display: flex;
          }
          .studio-grid[data-active-pane="preview"] > .preview-pane {
            display: flex;
          }
        }

        /* ─── Jobs pane ─── */
        .jobs-head {
          display: flex;
          justify-content: space-between;
          padding: 14px 16px;
          border-bottom: 1px solid var(--line);
          font-family: var(--mono);
          font-size: 10.5px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--paper-mute);
        }
        .jobs-title {
          color: var(--paper);
        }
        .jobs-count {
          color: var(--accent);
        }
        /* ─── Jobs toolbar (filter chips + search) ─── */
        .jobs-toolbar {
          padding: 10px 12px 8px;
          border-bottom: 1px solid var(--line);
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: var(--ink);
          position: sticky;
          top: 0;
          z-index: 2;
        }
        .jobs-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 3px;
        }
        .jobs-chip {
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper-mute);
          padding: 3px 8px;
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          border-radius: 2px;
        }
        .jobs-chip:hover {
          color: var(--paper);
        }
        .jobs-chip.on {
          background: var(--paper);
          color: var(--ink);
          border-color: var(--paper);
        }
        .jobs-search {
          width: 100%;
          background: var(--ink-2);
          border: 1px solid var(--line);
          color: var(--paper);
          padding: 6px 10px;
          font-family: var(--mono);
          font-size: 11.5px;
          border-radius: 2px;
        }
        .jobs-search:focus {
          outline: none;
          border-color: var(--accent);
        }
        .jobs-reset {
          display: block;
          margin: 10px auto 0;
          background: transparent;
          border: 1px solid var(--accent);
          color: var(--accent);
          font-family: var(--mono);
          font-size: 10px;
          padding: 5px 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
        }

        .jobs-list {
          flex: 1;
          overflow-y: auto;
        }
        .jobs-empty {
          padding: 32px 20px;
          color: var(--paper-mute);
          font-size: 12.5px;
          line-height: 1.5;
          font-family: var(--mono);
          text-align: center;
        }
        .job-item {
          position: relative;
          /* 竖卡片：缩略图占满栏宽放上面（视频留足空间），mini 文字放下面。 */
          display: flex;
          flex-direction: column;
          gap: 7px;
          padding: 10px 16px;
          border-bottom: 1px solid color-mix(in oklab, var(--ink) 55%, var(--line));
          cursor: pointer;
          transition: background 0.15s, box-shadow 0.15s;
        }
        /* 胶片片孔 —— 每个任务 = 一格 film cell，两侧跑矩形片孔，竖排连成一条胶片。
           矩形 holes（光透过=更亮）比小圆点更一眼读作 35mm 胶片。 */
        .job-item::before,
        .job-item::after {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          width: 9px;
          background: repeating-linear-gradient(
            to bottom,
            transparent 0 3px,
            color-mix(in oklab, var(--paper) 17%, transparent) 3px 10px,
            transparent 10px 14px
          );
          pointer-events: none;
        }
        .job-item::before { left: 2px; }
        .job-item::after { right: 2px; }
        .job-item:hover {
          background: var(--ink-2);
        }
        .job-item.active {
          background: color-mix(in oklab, var(--accent) 8%, var(--ink-2));
          box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--accent) 28%, transparent);
        }
        /* 选中帧 —— 片孔被安全灯点亮成琥珀色 */
        .job-item.active::before,
        .job-item.active::after {
          background: repeating-linear-gradient(
            to bottom,
            transparent 0 3px,
            color-mix(in oklab, var(--accent) 60%, transparent) 3px 10px,
            transparent 10px 14px
          );
        }
        .job-thumb {
          width: 100%;
          aspect-ratio: 16 / 9;
          background: var(--ink-3);
          overflow: hidden;
          position: relative;
          border: 1px solid color-mix(in oklab, var(--paper) 10%, transparent);
          border-radius: 3px;
        }
        .job-thumb :global(video),
        .job-thumb :global(img) {
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: var(--ink-3);
        }
        .job-thumb-ph {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          font-family: var(--mono);
          font-size: 9px;
          color: var(--paper-mute);
          letter-spacing: 0.14em;
        }
        /* 图片源失效兜底 —— 取代浏览器原生 broken-image 图标，
           PreviewPanel 大区 + jobs 列表小缩略两处共用。 */
        .job-image-fallback {
          width: 100%;
          height: 100%;
          min-height: 60px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          background: var(--ink-2);
          color: var(--paper-mute);
          font-family: var(--font-mono);
          padding: 8px;
        }
        .job-image-fallback-glyph {
          font-size: 22px;
          opacity: 0.55;
          line-height: 1;
        }
        .job-image-fallback-text {
          font-size: 11px;
          letter-spacing: 0.04em;
        }
        .job-image-fallback-hint {
          font-size: 9px;
          letter-spacing: 0.1em;
          color: var(--paper-mute);
          opacity: 0.75;
        }
        .job-pulse-dot {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: radial-gradient(circle, var(--accent) 0%, transparent 70%);
          animation: job-pulse 2.4s ease-in-out infinite;
        }
        @keyframes job-pulse {
          0%, 100% { transform: scale(0.6); opacity: 0.3; }
          50% { transform: scale(1.2); opacity: 0.9; }
        }
        .job-meta {
          min-width: 0;
        }
        .job-title {
          font-family: var(--serif);
          font-size: 10.5px;
          line-height: 1.25;
          color: var(--paper);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .job-sub {
          display: flex;
          align-items: center;
          gap: 5px;
          font-family: var(--mono);
          font-size: 7.5px;
          letter-spacing: 0.04em;
          color: var(--paper-mute);
          margin-top: 2px;
        }
        /* MODE 小标签 —— 一眼分清 T2V / I2V / R2V */
        .job-mode {
          flex: 0 0 auto;
          font-size: 7px;
          font-weight: 600;
          letter-spacing: 0.07em;
          color: var(--paper-mute);
          padding: 1px 4px;
          border: 1px solid var(--edge, var(--line));
          border-radius: 3px;
          background: color-mix(in oklab, var(--paper) 4%, transparent);
        }
        /* 模型名 —— mini，占据中间弹性宽、过长截断（保留模型+模式两条信息） */
        .job-model {
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--paper-dim);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        /* 状态 —— 极小彩字 + 同色圆点，颜色即状态（绿成片 / 金显影 / 红废片） */
        .job-status {
          flex: 0 0 auto;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .job-status::before {
          content: "";
          width: 4.5px;
          height: 4.5px;
          border-radius: 50%;
          background: currentColor;
        }
        .job-time {
          flex: 0 0 auto;
          font-family: var(--mono);
          font-size: 7.5px;
          color: var(--paper-dim);
          opacity: 0.7;
        }
        .job-actions {
          position: absolute;
          top: 7px;
          right: 14px;
          z-index: 1;
          display: flex;
          gap: 4px;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .job-item:hover .job-actions {
          opacity: 1;
        }
        .job-del,
        .job-pin,
        .job-retry {
          width: 22px;
          height: 22px;
          background: rgba(0, 0, 0, 0.7);
          border: 1px solid var(--line);
          border-radius: 5px;
          color: var(--paper);
          cursor: pointer;
          font-family: var(--mono);
          font-size: 11px;
          line-height: 1;
          padding: 0;
        }
        .job-del:hover {
          color: #c44;
          border-color: #c44;
        }
        .job-retry {
          color: var(--accent);
          border-color: var(--accent);
          opacity: 1 !important; /* always visible for error jobs */
        }
        .job-retry:hover {
          background: color-mix(in oklab, var(--accent) 20%, transparent);
        }
        .job-pin.on {
          color: var(--accent);
          border-color: var(--accent);
        }

        /* Visual hint that a job is draggable (grab cursor, subtle handle) */
        .job-item.draggable .job-thumb {
          cursor: grab;
        }
        .job-item.draggable:active .job-thumb {
          cursor: grabbing;
        }

        /* ─── Drop zones (only shown while a job is being dragged) ─── */
        .drop-row {
          display: none;
          gap: 10px;
          padding: 14px 40px 0;
          z-index: 10;
        }
        body[data-job-dragging="true"] .drop-row {
          display: flex;
          animation: dropRowIn 0.18s ease-out;
        }
        @keyframes dropRowIn {
          from {
            opacity: 0;
            transform: translateY(-6px);
          }
        }
        .drop-zone {
          flex: 1;
          padding: 16px 20px;
          border: 2px dashed var(--line);
          background: var(--ink-2);
          display: flex;
          align-items: center;
          gap: 12px;
          font-family: var(--mono);
          font-size: 12.5px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--paper-mute);
          transition: all 0.12s;
          min-height: 64px;
        }
        .drop-zone:hover,
        .drop-zone:focus-within {
          border-color: var(--accent);
          color: var(--accent);
          background: color-mix(in oklab, var(--accent) 14%, var(--ink-2));
        }
        .dz-glyph {
          font-size: 20px;
          font-family: var(--serif);
          font-weight: 400;
        }

        /* ─── Preview ─── */
        .preview-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 10px 40px 8px;
          min-height: 0;
          /* 展开「延续」/「链式」面板后，下方表单 + 提交按钮可能高过视口；
             不开滚动按钮就被裁掉，用户看不到。整列允许纵向滚动。 */
          overflow-y: auto;
        }
        .preview-stage {
          /* flex:1 1 0 让常态下 stage 撑满 preview-main 剩余空间；
             min-height 兜底视频不被下方面板挤成一条；
             ContinuationPanel 展开后内容堆出视口时由 .preview-main 的
             overflow-y:auto 接管滚动，stage 自然收缩到 min-height。 */
          flex: 1 1 0;
          min-height: 320px;
          background: var(--ink-2);
          border: 1px solid var(--line);
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          /* Breathing room around the video so it doesn't feel "cut off"
             at the edges of the dark frame. */
          padding: 8px;
        }
        .preview-stage video {
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: black;
        }

        /* ── 影院模式 ── 一键让视频铺满全屏成为绝对焦点：
              隐藏左栏 / 分隔条 / 配方 / 动作 / 底部对话框，grid 收成单列。 */
        .stage-theater-btn {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 6;
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          line-height: 1;
          color: var(--paper);
          background: color-mix(in oklab, var(--ink-1) 60%, transparent);
          border: 1px solid var(--edge, var(--line));
          border-radius: 8px;
          box-shadow: var(--hi, none);
          backdrop-filter: blur(6px);
          cursor: pointer;
          opacity: 0.55;
          transition:
            opacity 0.18s ease,
            border-color 0.18s ease,
            color 0.18s ease;
        }
        .preview-stage:hover .stage-theater-btn {
          opacity: 1;
        }
        .stage-theater-btn:hover {
          opacity: 1;
          border-color: var(--edge-gold, var(--accent));
          color: var(--accent);
        }
        .studio-app.theater .stage-theater-btn {
          opacity: 0.9;
        }
        .studio-app.theater .studio-grid {
          grid-template-columns: 1fr;
        }
        .studio-app.theater .jobs-pane,
        .studio-app.theater .pane-divider,
        .studio-app.theater .pane-tabs,
        .studio-app.theater .preview-recipe,
        .studio-app.theater .preview-actions,
        .studio-app.theater .oc-dock {
          display: none !important;
        }
        .studio-app.theater .preview-pane {
          padding-bottom: 16px;
        }
        .studio-app.theater .preview-main {
          padding: 10px 16px;
        }
        .studio-app.theater .preview-stage {
          min-height: 0;
        }
        .preview-ph {
          text-align: center;
          padding: 40px;
          max-width: 60ch;
        }
        .preview-ph-kicker {
          font-family: var(--mono);
          font-size: 10.5px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 12px;
        }
        .preview-ph h2 {
          font-family: var(--serif);
          font-size: 36px;
          line-height: 1.1;
          font-style: italic;
          font-weight: 400;
          color: var(--paper);
          margin: 0 0 16px;
        }
        /* 强调句用鎏金→朱砂渐变字 —— 创作平台的视觉焦点 */
        .preview-ph h2 em {
          font-style: italic;
          background: var(--gradient-cta);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
        }
        .preview-ph p {
          font-size: 14px;
          line-height: 1.55;
          color: var(--paper-dim);
        }
        /* 显影式入场 —— 成片从「暗 + 低饱和」浮到「清晰」，像相纸在显影液里浮现 */
        .preview-develop-in {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: develop-in 0.75s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes develop-in {
          from {
            opacity: 0;
            filter: brightness(0.38) contrast(1.35) saturate(0.65);
            transform: scale(1.012);
          }
          to {
            opacity: 1;
            filter: none;
            transform: none;
          }
        }
        /* ── 生成中 —— 动态呼吸等待页 ── */
        .preview-developing {
          position: absolute;
          inset: 0;
          max-width: none;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: var(--ink);
        }
        /* 源素材模糊背景 */
        .dev-bg-img {
          position: absolute;
          inset: -20px;
          width: calc(100% + 40px);
          height: calc(100% + 40px);
          object-fit: cover;
          filter: blur(40px) brightness(0.3) saturate(0.6);
          opacity: 0;
          z-index: 0;
          animation: dev-bg-in 1.2s ease-out 0.3s forwards;
        }
        @keyframes dev-bg-in {
          to { opacity: 0.6; }
        }
        /* 呼吸光环 */
        .dev-rings {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1;
          pointer-events: none;
        }
        .dev-ring {
          position: absolute;
          border-radius: 50%;
          border: 1px solid color-mix(in oklab, var(--accent) 20%, transparent);
          animation: dev-breathe 4s ease-in-out infinite;
        }
        .dev-ring-1 { width: 180px; height: 180px; animation-delay: 0s; }
        .dev-ring-2 { width: 280px; height: 280px; animation-delay: 0.6s; border-color: color-mix(in oklab, var(--accent) 12%, transparent); }
        .dev-ring-3 { width: 400px; height: 400px; animation-delay: 1.2s; border-color: color-mix(in oklab, var(--accent) 6%, transparent); }
        @keyframes dev-breathe {
          0%, 100% { transform: scale(0.92); opacity: 0.3; }
          50% { transform: scale(1.08); opacity: 1; }
        }
        /* 游走粒子 */
        .dev-particles {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
        }
        .dev-dot {
          position: absolute;
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: var(--accent);
          opacity: 0;
          animation: dev-float 6s ease-in-out infinite;
          animation-delay: calc(var(--i) * 0.9s);
          left: calc(20% + var(--i) * 12%);
          top: calc(30% + var(--i) * 7%);
        }
        @keyframes dev-float {
          0% { opacity: 0; transform: translateY(20px) scale(0); }
          20% { opacity: 0.7; transform: translateY(0) scale(1); }
          80% { opacity: 0.5; transform: translateY(-30px) scale(0.8); }
          100% { opacity: 0; transform: translateY(-50px) scale(0); }
        }
        /* 中心内容 */
        .dev-content {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }
        /* 呼吸脉动核心 */
        .dev-pulse-core {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: radial-gradient(circle, var(--accent) 0%, transparent 70%);
          opacity: 0.6;
          margin-bottom: 24px;
          animation: dev-core-breathe 3s ease-in-out infinite;
          box-shadow:
            0 0 30px color-mix(in oklab, var(--accent) 30%, transparent),
            0 0 60px color-mix(in oklab, var(--accent) 15%, transparent);
        }
        @keyframes dev-core-breathe {
          0%, 100% { transform: scale(0.7); opacity: 0.35; }
          50% { transform: scale(1.15); opacity: 0.8; }
        }
        /* 标签文字：微光闪烁 */
        .dev-label {
          font-family: var(--font-mono);
          font-size: 13px;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: var(--paper);
          background: linear-gradient(
            110deg,
            var(--paper-mute) 0%,
            var(--paper) 40%,
            var(--accent) 50%,
            var(--paper) 60%,
            var(--paper-mute) 100%
          );
          background-size: 250% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: dev-shimmer 3s ease-in-out infinite;
        }
        @keyframes dev-shimmer {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
        .dev-timer {
          font-family: var(--font-mono);
          font-size: 28px;
          font-weight: 300;
          letter-spacing: 0.06em;
          color: var(--paper);
          margin-top: 4px;
          animation: dev-timer-breathe 2.5s ease-in-out infinite;
        }
        @keyframes dev-timer-breathe {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        .dev-model {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          color: var(--paper-mute);
          margin-top: 4px;
        }
        /* 辉光底层 */
        .preview-developing::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background: radial-gradient(
            60% 50% at 50% 50%,
            color-mix(in oklab, var(--accent) 14%, transparent) 0%,
            transparent 70%
          );
          animation: dev-glow-pulse 4s ease-in-out infinite;
        }
        @keyframes dev-glow-pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.95); }
          50% { opacity: 0.9; transform: scale(1.1); }
        }
        .preview-meta {
          padding: 14px 18px;
          border-top: 1px solid var(--line);
          display: flex;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          font-family: var(--mono);
          font-size: 10.5px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--paper-mute);
        }
        .preview-meta b {
          color: var(--paper);
          font-weight: 500;
        }
        /* 历史任务配方明细 —— prompt + 全量参数 + 输入媒体
           字号压到最小可读档，尽量把垂直空间让给视频。 */
        .preview-recipe {
          padding: 7px 0 2px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: 30vh;
          overflow-y: auto;
        }
        .preview-rc-prompt {
          margin: 0;
          font-family: var(--serif);
          font-style: italic;
          font-size: 10px;
          line-height: 1.4;
          color: var(--paper);
        }
        .preview-rc-neg {
          margin: 0;
          font-family: var(--mono);
          font-size: 9px;
          line-height: 1.45;
          color: var(--paper-mute);
        }
        .preview-rc-neg-k {
          color: var(--red);
          letter-spacing: 0.08em;
          margin-right: 6px;
        }
        /* 提示词折叠 —— 默认收起，只留一行预览，把竖向空间还给视频 */
        .preview-rc-prompts {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .preview-rc-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
          min-width: 0;
          padding: 0;
          background: none;
          border: 0;
          cursor: pointer;
          text-align: left;
        }
        .preview-rc-caret {
          flex: 0 0 auto;
          font-size: 8px;
          color: var(--paper-mute);
          transition: transform 0.15s ease;
        }
        .preview-rc-caret.open {
          transform: rotate(90deg);
        }
        .preview-rc-toggle-k {
          flex: 0 0 auto;
          font-family: var(--mono);
          font-size: 8px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--paper-mute);
        }
        .preview-rc-peek {
          flex: 1 1 auto;
          min-width: 0;
          font-family: var(--serif);
          font-style: italic;
          font-size: 10px;
          color: var(--paper-mute);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .preview-rc-toggle:hover .preview-rc-caret,
        .preview-rc-toggle:hover .preview-rc-toggle-k,
        .preview-rc-toggle:hover .preview-rc-peek {
          color: var(--paper);
        }
        .preview-rc-params {
          display: flex;
          flex-wrap: wrap;
          gap: 3px 10px;
          font-family: var(--mono);
          font-size: 8px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--paper-mute);
        }
        .preview-rc-params b {
          color: var(--paper);
          font-weight: 500;
          margin-right: 3px;
        }
        .preview-rc-media {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .preview-rc-thumb {
          width: 50px;
          height: 50px;
          object-fit: cover;
          border-radius: 6px;
          background: var(--ink-3);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .preview-rc-thumb:hover {
          transform: scale(1.12);
          box-shadow: 0 0 0 2px var(--accent);
          z-index: 1;
        }
        .preview-rc-thumb-ph {
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--mono);
          font-size: 12px;
          color: var(--paper-mute);
        }
        .ref-lightbox {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.82);
          backdrop-filter: blur(8px);
          cursor: pointer;
          animation: lb-in 0.2s ease-out;
        }
        @keyframes lb-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .ref-lightbox-img {
          max-width: 85vw;
          max-height: 85vh;
          object-fit: contain;
          border-radius: 10px;
          box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
          cursor: default;
          animation: lb-img-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes lb-img-in {
          from { transform: scale(0.88); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .preview-actions {
          display: flex;
          gap: 6px;
          padding: 6px 0 0;
          position: relative;
          flex-wrap: wrap;
        }
        /* 操作按钮 —— 紧凑单行 pill，不随列数拉伸、不换行折断中文 */
        .preview-actions .btn-ghost {
          flex: 0 0 auto;
          padding: 7px 13px;
          font-size: 10px;
          letter-spacing: 0.04em;
          white-space: nowrap;
        }
        /* 强调态 —— 成图后「用此图生成视频」是建议的下一步，accent 描边引导 */
        .preview-actions .btn-ghost-accent {
          border-color: color-mix(in oklab, var(--accent) 55%, var(--line));
          color: var(--accent);
        }
        .preview-actions .btn-ghost-accent:hover {
          border-color: var(--accent);
          background: color-mix(in oklab, var(--accent) 12%, transparent);
        }
        .preview-err {
          padding: 20px;
          color: #c44;
          font-family: var(--mono);
          font-size: 12px;
          text-align: center;
        }

        /* Running ETA bar */
        .eta-bar {
          width: min(320px, 80%);
          margin: 18px auto 0;
          height: 4px;
          background: var(--ink-3);
          border: 1px solid var(--line);
          overflow: hidden;
          position: relative;
        }
        .eta-fill {
          height: 100%;
          background: linear-gradient(
            90deg,
            var(--accent),
            color-mix(in oklab, var(--accent) 60%, var(--paper))
          );
          transition: width 0.6s ease;
        }

        /* Done-state toast (above actions) */
        .preview-toast {
          position: absolute;
          top: -32px;
          right: 40px;
          background: var(--paper);
          color: var(--ink);
          padding: 5px 12px;
          font-family: var(--mono);
          font-size: 10.5px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          animation: toast-in 0.2s ease-out;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        @keyframes toast-in {
          from {
            transform: translateY(4px);
            opacity: 0;
          }
        }

        /* Pulsing dot for "N running" tag */
        .dot.pulsing {
          animation: dotPulse 1.2s ease-in-out infinite;
        }
        @keyframes dotPulse {
          0%, 100% {
            opacity: 1;
            box-shadow: 0 0 0 0 color-mix(in oklab, var(--accent) 50%, transparent);
          }
          50% {
            opacity: 0.75;
            box-shadow: 0 0 0 5px color-mix(in oklab, var(--accent) 0%, transparent);
          }
        }
        .tag.running {
          font-variant-numeric: tabular-nums;
        }
        /* 未配置 API Key —— 顶栏徽章变可点击的红色引导 */
        .tag.tag-nokey {
          background: none;
          font: inherit;
          cursor: pointer;
          border-color: var(--red);
          color: var(--red);
          transition: background 0.15s ease;
        }
        .tag.tag-nokey:hover {
          background: color-mix(in oklab, var(--red) 14%, transparent);
        }
        .dot.dot-warn {
          background: var(--red);
          box-shadow: 0 0 8px var(--red);
        }

        /* Small keyboard hint inside submit button */
        .btn-kbd {
          margin-left: 8px;
          padding: 2px 6px;
          background: color-mix(in oklab, var(--ink) 30%, transparent);
          border-radius: 3px;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.08em;
          opacity: 0.8;
        }

        /* ─── Recent strip ─── */
        .strip {
          padding: 14px 40px 24px;
          display: flex;
          gap: 8px;
          overflow-x: auto;
          border-top: 1px solid var(--line);
        }
        .strip-cell {
          flex: 0 0 120px;
          aspect-ratio: 16/10;
          background: var(--ink-2);
          border: 1px solid var(--line);
          overflow: hidden;
          cursor: pointer;
          position: relative;
        }
        .strip-cell.active {
          border-color: var(--accent);
        }
        .strip-cell :global(video),
        .strip-cell :global(img) {
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: var(--ink-2);
        }
        .strip-cell .strip-ph {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          font-family: var(--mono);
          font-size: 9px;
          color: var(--paper-mute);
          letter-spacing: 0.1em;
        }

        /* ─── Params pane ─── */
        .mode-tabs {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          border-bottom: 1px solid var(--line);
          background: var(--ink-2);
        }
        .mode-tab {
          padding: 14px 8px;
          background: transparent;
          border: none;
          font-family: var(--mono);
          font-size: 10.5px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--paper);
          cursor: pointer;
          transition: all 0.15s;
        }
        .mode-tab:hover {
          color: var(--accent);
          background: var(--ink);
        }
        .mode-tab.on {
          background: var(--ink);
          color: var(--accent);
          box-shadow: inset 0 -2px 0 var(--accent);
        }
        /* Mode description row (with library trigger) */
        .mode-desc-row {
          display: flex;
          align-items: stretch;
          border-bottom: 1px solid var(--line);
          background: linear-gradient(
            to bottom,
            color-mix(in oklab, var(--accent) 8%, var(--ink)),
            var(--ink)
          );
        }
        .mode-desc {
          flex: 1;
          padding: 8px 14px;
          font-family: var(--serif);
          font-style: italic;
          font-size: 11.5px;
          line-height: 1.4;
          color: var(--paper-dim);
        }
        .lib-trigger {
          flex-shrink: 0;
          padding: 0 14px;
          background: transparent;
          border: none;
          color: var(--accent);
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.15s;
        }
        .lib-trigger:hover:not(:disabled) {
          background: color-mix(in oklab, var(--accent) 14%, transparent);
        }
        .lib-trigger:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        /* Page-level toast (save confirmation etc.) */
        .studio-toast {
          position: fixed;
          top: 72px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--paper);
          color: var(--ink);
          padding: 10px 20px;
          font-family: var(--mono);
          font-size: 11.5px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          z-index: 90;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
          animation: studio-toast-in 0.18s ease-out;
        }
        @keyframes studio-toast-in {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-8px);
          }
        }

        /* Library CTA in empty preview state */
        .preview-lib-btn {
          margin-top: 24px;
          padding: 10px 18px;
          background: transparent;
          border: 1px solid var(--accent);
          color: var(--accent);
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.15s;
        }
        .preview-lib-btn:hover {
          background: var(--accent);
          color: var(--ink);
        }

        .pf-row {
          padding: 14px 16px;
        }
        .pf-row-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 6px;
        }
        .pf-label {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--paper-mute);
        }
        .pf-hint,
        .pf-note {
          font-family: var(--mono);
          font-size: 9.5px;
          color: var(--paper-dim);
          opacity: 0.7;
          margin-top: 6px;
        }
        .pf-clear {
          background: transparent;
          border: 1px solid transparent;
          color: var(--paper-mute);
          font-family: var(--mono);
          font-size: 10px;
          cursor: pointer;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 2px 8px;
          border-radius: 2px;
          transition: all 0.12s;
        }
        .pf-clear:hover {
          color: #ff5a4d;
          border-color: #ff5a4d;
          background: color-mix(in oklab, #ff5a4d 10%, transparent);
        }
        .pf-input {
          width: 100%;
          background: var(--ink-2);
          border: 1px solid transparent;
          color: var(--paper);
          padding: 8px 10px;
          font-family: var(--mono);
          font-size: 12px;
          border-radius: 2px;
          resize: vertical;
        }
        .pf-input:focus {
          outline: none;
          border-color: var(--accent);
        }
        textarea.pf-input {
          font-family: var(--serif);
          font-style: italic;
          font-size: 14px;
          line-height: 1.4;
        }
        .pf-segments {
          display: flex;
          flex-wrap: wrap;
          gap: 2px;
          background: var(--ink-2);
          padding: 3px;
          border-radius: 3px;
        }
        .pf-seg {
          flex: 1;
          min-width: 70px;
          padding: 7px 10px;
          background: transparent;
          border: none;
          color: var(--paper-dim);
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          border-radius: 2px;
        }
        .pf-seg:hover {
          color: var(--paper);
        }
        .pf-seg.on {
          background: var(--paper);
          color: var(--ink);
        }
        .pf-int {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .pf-int input[type="range"] {
          flex: 1;
          accent-color: var(--accent);
        }
        .pf-int-val {
          font-family: var(--mono);
          font-size: 12px;
          color: var(--accent);
          min-width: 40px;
          text-align: right;
        }
        .pf-int.locked {
          padding: 6px 10px;
          background: var(--ink-2);
          border: 1px dashed var(--line);
          border-radius: 2px;
        }
        .pf-locked-hint {
          font-family: var(--mono);
          font-size: 9.5px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--paper-mute);
          margin-left: auto;
        }
        .pf-dice {
          background: var(--ink-2);
          border: 1px solid transparent;
          color: var(--paper);
          font-size: 14px;
          width: 32px;
          height: 32px;
          cursor: pointer;
          flex-shrink: 0;
          padding: 0;
          line-height: 1;
          border-radius: 2px;
          transition: all 0.15s;
        }
        .pf-dice:hover {
          border-color: var(--accent);
          background: color-mix(in oklab, var(--accent) 14%, transparent);
        }
        .pf-dice:active {
          transform: rotate(90deg);
        }

        /* Prompt / negative-prompt counter */
        .pf-text-wrap {
          position: relative;
        }
        .pf-counter {
          position: absolute;
          right: 8px;
          bottom: 6px;
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.08em;
          color: var(--paper-mute);
          pointer-events: none;
          background: color-mix(in oklab, var(--ink-2) 80%, transparent);
          padding: 2px 5px;
          border-radius: 2px;
        }
        .pf-counter .warn {
          color: var(--accent);
        }
        .pf-counter-sep {
          opacity: 0.5;
        }
        .pf-counter-hint {
          text-transform: uppercase;
        }
        .pf-toggle {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 4px 12px 4px 4px;
          background: var(--ink-2);
          border: 1px solid var(--line);
          border-radius: 18px;
          cursor: pointer;
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--paper-mute);
        }
        .pf-toggle.on {
          border-color: var(--accent);
          color: var(--accent);
        }
        .pf-toggle-knob {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--paper-mute);
          transition: all 0.15s;
        }
        .pf-toggle.on .pf-toggle-knob {
          background: var(--accent);
          box-shadow: 0 0 8px rgba(200, 100, 60, 0.5);
        }

        /* Media picker */
        .mp-tabs {
          display: flex;
          gap: 4px;
          margin-bottom: 8px;
        }
        .mp-tab {
          padding: 5px 12px;
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper-mute);
          font-family: var(--mono);
          font-size: 9.5px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .mp-tab.on {
          background: var(--paper);
          color: var(--ink);
          border-color: var(--paper);
        }
        .mp-url-row {
          display: flex;
          gap: 6px;
        }
        .mp-btn {
          padding: 0 14px;
          background: var(--accent);
          color: var(--ink);
          border: none;
          font-family: var(--mono);
          font-size: 10.5px;
          letter-spacing: 0.1em;
          cursor: pointer;
        }
        .mp-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .mp-drop {
          border: 1.5px dashed var(--line);
          padding: 24px 12px;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          outline: none;
        }
        .mp-drop:hover,
        .mp-drop:focus-visible {
          border-color: var(--accent);
          background: color-mix(in oklab, var(--accent) 6%, transparent);
        }
        .mp-hint {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          color: var(--paper-mute);
        }
        .mp-preview {
          display: grid;
          grid-template-columns: 80px 1fr;
          gap: 10px;
          align-items: center;
        }
        .mp-thumb {
          width: 80px;
          height: 60px;
          object-fit: contain;
          background: black;
          border: 1px solid var(--line);
        }
        /* Friendly placeholder shown when the file lives only in OSS
           (previewUrl/blob: gone after reload). Replaces broken-image icon. */
        .mp-thumb-ph {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          background: color-mix(in oklab, var(--accent) 16%, var(--ink-2));
          color: var(--accent);
          font-family: var(--font-mono);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.12em;
        }
        .mp-thumb-ph-sub {
          font-size: 9px;
          letter-spacing: 0.1em;
          color: var(--paper-mute);
          font-weight: 400;
        }
        /* Clickable variant: lets users re-upload to recover preview
           for old entries that lack thumbDataUrl/localKey. */
        button.mp-thumb-ph-btn {
          padding: 0;
          border: 1px dashed var(--accent);
          cursor: pointer;
          transition: background 0.15s;
        }
        button.mp-thumb-ph-btn:hover {
          background: color-mix(in oklab, var(--accent) 26%, var(--ink-2));
        }
        button.mp-thumb-ph-btn .mp-thumb-ph-sub {
          color: var(--accent);
        }
        /* Click-to-zoom thumbnails. */
        .mp-thumb-zoomable {
          cursor: zoom-in;
          transition: opacity 0.12s, transform 0.12s;
        }
        .mp-thumb-zoomable:hover {
          opacity: 0.85;
          transform: scale(1.02);
        }
        /* Fullscreen lightbox. */
        .mp-lightbox {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.94);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: zoom-out;
          padding: 48px;
          animation: mp-lb-fade 0.15s ease-out;
        }
        @keyframes mp-lb-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .mp-lightbox-img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          display: block;
          cursor: default;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .mp-lightbox-close {
          position: fixed;
          top: 16px;
          right: 24px;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.4);
          color: white;
          width: 36px;
          height: 36px;
          font-size: 22px;
          line-height: 1;
          cursor: pointer;
          border-radius: 2px;
          font-family: var(--font-mono);
          transition: background 0.12s, border-color 0.12s;
        }
        .mp-lightbox-close:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: white;
        }
        .mp-lightbox-hint {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          color: rgba(255, 255, 255, 0.6);
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .mp-meta {
          min-width: 0;
          font-family: var(--mono);
          font-size: 10px;
        }
        .mp-name {
          color: var(--paper);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mp-url {
          color: var(--paper-mute);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 2px;
        }
        .mp-err {
          color: #c44;
          font-family: var(--mono);
          font-size: 10.5px;
          margin-top: 6px;
        }

        .pf-actions {
          padding: 12px 16px 18px;
          display: flex;
          gap: 8px;
          position: sticky;
          bottom: 0;
          background: linear-gradient(
            to top,
            var(--ink) 60%,
            color-mix(in oklab, var(--ink) 60%, transparent)
          );
        }
        .btn-primary,
        .btn-ghost {
          flex: 1;
          padding: 11px 14px;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
          border-radius: 2px;
        }
        .btn-primary {
          background: var(--accent);
          color: var(--ink);
          border: 1px solid var(--accent);
          font-weight: 600;
        }
        .btn-primary:hover {
          filter: brightness(1.1);
        }
        .btn-ghost {
          background: transparent;
          color: var(--paper);
          border: 1px solid var(--line);
        }
        .btn-ghost:hover {
          border-color: var(--paper);
        }
        /* "Reset" is now a compact icon button */
        .pf-actions .btn-ghost:first-child {
          flex: 0 0 40px;
        }
        /* Error state retry block */
        .preview-err-msg {
          font-size: 14px;
          max-width: 58ch;
          margin: 0 auto;
          line-height: 1.5;
          color: #f88;
        }
        .preview-err-raw {
          margin-top: 10px;
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--paper-mute);
          max-width: 62ch;
          word-break: break-word;
          opacity: 0.7;
        }

        /* Cost estimate strip */
        .pf-cost-strip {
          padding: 8px 16px;
          border-top: 1px solid var(--line);
          display: flex;
          align-items: baseline;
          gap: 8px;
          font-family: var(--font-mono);
          font-size: 10.5px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--paper-mute);
          background: var(--ink-2);
          font-weight: 600;
        }
        .pf-cost-strip b {
          font-family: var(--font-serif);
          font-style: italic;
          font-weight: 400;
          font-size: 18px;
          color: var(--accent);
          text-transform: none;
        }
        .pf-cost-note {
          margin-left: auto;
          text-transform: none;
          opacity: 0.7;
          font-size: 10px;
        }

        /* Group color bar on job items */
        .job-item {
          position: relative;
        }
        .job-group-bar {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          pointer-events: none;
        }
        .job-item.grouped {
          padding-left: 18px;
        }
      `}</style>
    </div>
  );
}
