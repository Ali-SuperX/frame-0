"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useStudioStore, type Job } from "@/lib/store";
import { useCanvasStore } from "@/lib/canvasStore";
import { prepareDirectorFromJob } from "@/lib/r2v/sendToDirector";
import { storeLocalFile } from "@/lib/editor/localFiles";
import AssetEditModal from "./AssetEditModal";
import { isImageMode, type Mode } from "@/lib/bailian/models";
import { useJobPolling } from "@/lib/bailian/useJobPolling";
import { useLocalJobRehydration } from "@/lib/bailian/useLocalJobRehydration";
import { useJobAutoBackup } from "@/lib/bailian/useJobAutoBackup";
import { useLocalVideoRecovery } from "@/lib/bailian/useLocalVideoRecovery";
import { useStateBackup } from "@/lib/bailian/useStateBackup";
import LocaleSwitcher from "./LocaleSwitcher";
import ManualEntryModal from "./archive/ManualEntryModal";
import type { AssetCategory } from "@/lib/store";
import "@/styles/frame.css";

const CATEGORY_TABS: { id: "all" | AssetCategory; zh: string; en: string; icon: string }[] = [
  { id: "all", zh: "全部", en: "All", icon: "🗂" },
  { id: "output", zh: "成片", en: "Output", icon: "🎬" },
  { id: "character", zh: "角色", en: "Character", icon: "🧑" },
  { id: "scene", zh: "场景", en: "Scene", icon: "🏞" },
  { id: "prop", zh: "道具", en: "Prop", icon: "📦" },
  { id: "footage", zh: "素材", en: "Footage", icon: "📁" },
  { id: "audio", zh: "音频", en: "Audio", icon: "🎵" },
];

const ARCHIVE_PAGE_SIZE = 48;
const ARCHIVE_MEDIA_EAGER = 8;
const MODE_FILTER_OPTIONS: { value: "all" | Mode; zh: string; en: string }[] = [
  { value: "all", zh: "全部模式", en: "All modes" },
  { value: "t2v", zh: "文生视频 T2V", en: "T2V" },
  { value: "i2v", zh: "图生视频 I2V", en: "I2V" },
  { value: "r2v", zh: "角色生视频 R2V", en: "R2V" },
  { value: "t2i", zh: "文生图 T2I", en: "T2I" },
  { value: "i2i", zh: "图生图 I2I", en: "I2I" },
  { value: "ve", zh: "视频编辑 VE", en: "VE" },
];

function inferCategory(j: Job): AssetCategory {
  if (j.category) return j.category;
  if (j.mode === "t2i" || j.mode === "i2i") {
    if (j.tags?.some((t) => t === "角色" || t === "character")) return "character";
    if (j.tags?.some((t) => t === "场景" || t === "scene")) return "scene";
    return "output";
  }
  if (j.source === "manual" || j.source === "imported") return "footage";
  return "output";
}

function modeAssetType(mode: "all" | Mode): "all" | "video" | "image" {
  if (mode === "all") return "all";
  return isImageMode(mode) ? "image" : "video";
}

function modeMatchesType(mode: "all" | Mode, type: "all" | "video" | "image") {
  return mode === "all" || type === "all" || modeAssetType(mode) === type;
}

function searchMatchesJob(job: Job, q: string) {
  if (!q) return true;
  return `${job.title} ${job.prompt ?? ""} ${job.modelId} ${(job.tags ?? []).join(" ")}`
    .toLowerCase()
    .includes(q);
}

type ViewMode = "editorial" | "grid" | "strip";

function fmtDate(ts: number, locale: string) {
  const d = new Date(ts);
  return d.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function editorialSize(i: number): "xl" | "l" | "m" | "s" {
  const pattern: Array<"xl" | "l" | "m" | "s"> = [
    "xl", "m", "m", "m", "l", "l", "s", "s", "s", "s", "m", "m",
  ];
  return pattern[i % pattern.length];
}

export default function Archive() {
  const t = useTranslations();
  const locale = useLocale();
  const zh = locale === "zh";
  const jobs = useStudioStore((s) => s.jobs);
  const togglePublish = useStudioStore((s) => s.togglePublish);
  const toggleFavorite = useStudioStore((s) => s.toggleFavorite);
  const deleteJob = useStudioStore((s) => s.deleteJob);
  const loadJobIntoDraft = useStudioStore((s) => s.loadJobIntoDraft);
  const selectJob = useStudioStore((s) => s.selectJob);
  const setPendingReuse = useStudioStore((s) => s.setPendingReuse);
  const importWorksFromJson = useStudioStore((s) => s.importWorksFromJson);
  const createManualWork = useStudioStore((s) => s.createManualWork);
  const setJobTags = useStudioStore((s) => s.setJobTags);
  const setJobTitle = useStudioStore((s) => s.setJobTitle);
  const setJobNote = useStudioStore((s) => s.setJobNote);
  const router = useRouter();

  /* ─── Manual entry + JSON import ─── */
  const [manualOpen, setManualOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [editJob, setEditJob] = useState<Job | null>(null);
  const [dragActive, setDragActive] = useState(false);
  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  }
  async function handleImportFile(file: File) {
    try {
      const text = await file.text();
      const res = importWorksFromJson(text);
      if (res.error) {
        flash((zh ? "导入失败：" : "Import failed: ") + res.error);
      } else {
        flash(
          zh
            ? `导入完成 · 新增 ${res.added} · 跳过 ${res.skipped}`
            : `Imported · ${res.added} added · ${res.skipped} skipped`
        );
      }
    } catch (e) {
      flash(
        (zh ? "读取失败：" : "Read failed: ") +
          (e instanceof Error ? e.message : String(e))
      );
    }
  }

  /* 上传本地素材进资产库 —— 字节存 IDB(localKey) + blob 预览，建成 manual done job。
     不在此刻传 OSS：被用作 i2v 首帧/r2v 参考时，AssetPicker 的 jobResultToFile 会重传。 */
  async function handleUploadFiles(files: FileList | File[] | null) {
    const arr = Array.from(files ?? []).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    if (!arr.length) return;
    let n = 0;
    for (const file of arr) {
      try {
        const localKey = `asset-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        await storeLocalFile(localKey, file);
        const blobUrl = URL.createObjectURL(file);
        createManualWork({
          title: file.name.replace(/\.[^.]+$/, "") || (zh ? "上传素材" : "Upload"),
          videoUrl: blobUrl,
          localKey,
          localMime: file.type,
          mode: file.type.startsWith("image/") ? "t2i" : "t2v",
          sourceLabel: zh ? "本地上传" : "Local upload",
        });
        n++;
      } catch (e) {
        flash(
          (zh ? "上传失败：" : "Upload failed: ") +
            (e instanceof Error ? e.message : String(e))
        );
      }
    }
    if (n) flash(zh ? `已上传 ${n} 个素材到资产库` : `Uploaded ${n} asset(s)`);
  }

  // Keep running jobs ticking even while viewing Archive.
  useJobPolling();
  const [maintenanceReady, setMaintenanceReady] = useState(false);

  useEffect(() => {
    if (maintenanceReady) return;
    const start = () => setMaintenanceReady(true);
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(start, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const timer = window.setTimeout(start, 2200);
    return () => window.clearTimeout(timer);
  }, [maintenanceReady]);

  /* ─── 搜索 / 筛选 / 排序（资产库的核心管理能力） ─── */
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "footage" | "character" | "scene" | "prop" | "output" | "audio">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "video" | "image">("all");
  const [modeFilter, setModeFilter] = useState<"all" | Mode>("all");
  const [sortBy, setSortBy] = useState<"new" | "old">("new");
  const [favOnly, setFavOnly] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const searchNeedle = deferredQuery.trim().toLowerCase();

  // 资产库 = 全部「已完成 + 有产出」的生成资产（视频 + 图片）。
  // 搜索（标题 / prompt / 模型）、类型、模式、排序就地派生。
  const allAssets = useMemo(
    () => jobs.filter((j) => j.status === "done" && !!j.videoUrl),
    [jobs]
  );
  const filteredModeOptions = useMemo(
    () => MODE_FILTER_OPTIONS.filter((opt) => modeMatchesType(opt.value, typeFilter)),
    [typeFilter]
  );
  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    for (const j of allAssets) {
      if (categoryFilter !== "all" && (j.category || inferCategory(j)) !== categoryFilter) continue;
      if (typeFilter === "video" && isImageMode(j.mode)) continue;
      if (typeFilter === "image" && !isImageMode(j.mode)) continue;
      if (modeFilter !== "all" && j.mode !== modeFilter) continue;
      if (favOnly && !j.favorite) continue;
      if (!searchMatchesJob(j, searchNeedle)) continue;
      for (const tag of j.tags ?? []) tags.add(tag);
    }
    return Array.from(tags).sort();
  }, [allAssets, categoryFilter, typeFilter, modeFilter, favOnly, searchNeedle]);
  const activeTagFilter = tagFilter && tagOptions.includes(tagFilter) ? tagFilter : null;
  const activeFilterCount =
    (categoryFilter !== "all" ? 1 : 0) +
    (typeFilter !== "all" ? 1 : 0) +
    (modeFilter !== "all" ? 1 : 0) +
    (favOnly ? 1 : 0) +
    (activeTagFilter ? 1 : 0) +
    (query.trim() ? 1 : 0);
  const categoryCounts = useMemo(() => {
    const counts: Record<AssetCategory, number> = {
      output: 0,
      character: 0,
      scene: 0,
      prop: 0,
      footage: 0,
      audio: 0,
    };
    for (const j of allAssets) {
      if (typeFilter === "video" && isImageMode(j.mode)) continue;
      if (typeFilter === "image" && !isImageMode(j.mode)) continue;
      if (modeFilter !== "all" && j.mode !== modeFilter) continue;
      if (favOnly && !j.favorite) continue;
      if (activeTagFilter && !j.tags?.includes(activeTagFilter)) continue;
      if (!searchMatchesJob(j, searchNeedle)) continue;
      counts[j.category || inferCategory(j)]++;
    }
    return counts;
  }, [allAssets, typeFilter, modeFilter, favOnly, activeTagFilter, searchNeedle]);
  const works = useMemo(() => {
    let list = allAssets;
    if (categoryFilter !== "all") {
      list = list.filter((j) => {
        const cat = j.category || inferCategory(j);
        return cat === categoryFilter;
      });
    }
    if (typeFilter === "video") list = list.filter((j) => !isImageMode(j.mode));
    else if (typeFilter === "image") list = list.filter((j) => isImageMode(j.mode));
    if (modeFilter !== "all") list = list.filter((j) => j.mode === modeFilter);
    if (favOnly) list = list.filter((j) => j.favorite);
    if (activeTagFilter) list = list.filter((j) => j.tags?.includes(activeTagFilter));
    if (searchNeedle) list = list.filter((j) => searchMatchesJob(j, searchNeedle));
    const ts = (j: Job) => j.completedAt ?? j.createdAt;
    return [...list].sort((a, b) =>
      sortBy === "new" ? ts(b) - ts(a) : ts(a) - ts(b)
    );
  }, [allAssets, searchNeedle, categoryFilter, typeFilter, modeFilter, sortBy, favOnly, activeTagFilter]);

  // 全库已用过的标签 —— 供筛选条 + 编辑建议复用。
  const allTags = useMemo(
    () => Array.from(new Set(allAssets.flatMap((j) => j.tags ?? []))).sort(),
    [allAssets]
  );

  const [view, setView] = useState<ViewMode>("grid");

  /* ─── Batch selection ─── */
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function clearSelectionForFilter() {
    setSelected(new Set());
    setSelectMode(false);
  }

  function applyCategoryFilter(next: "all" | AssetCategory) {
    clearSelectionForFilter();
    setCategoryFilter(next);
  }

  function applyTypeFilter(next: "all" | "video" | "image") {
    clearSelectionForFilter();
    setTypeFilter(next);
    if (!modeMatchesType(modeFilter, next)) setModeFilter("all");
  }

  function applyModeFilter(next: "all" | Mode) {
    clearSelectionForFilter();
    setModeFilter(next);
    if (next !== "all") setTypeFilter(modeAssetType(next));
  }

  function applyTagFilter(next: string | null) {
    clearSelectionForFilter();
    setTagFilter(next);
  }

  function clearArchiveFilters() {
    clearSelectionForFilter();
    setQuery("");
    setCategoryFilter("all");
    setTypeFilter("all");
    setModeFilter("all");
    setFavOnly(false);
    setTagFilter(null);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(works.map((w) => w.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function downloadSelected() {
    const picks = works.filter((w) => selected.has(w.id) && w.videoUrl);
    for (const w of picks) {
      try {
        const res = await fetch(w.videoUrl!);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `frame-0_${w.id.slice(0, 8)}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        // Tiny delay so browsers don't block multi-download.
        await new Promise((r) => setTimeout(r, 400));
      } catch {
        /* skip */
      }
    }
  }

  /* ─── 单资产操作（卡片悬浮 + 打通工坊） ─── */
  async function downloadOne(job: Job) {
    if (!job.videoUrl) return;
    try {
      const res = await fetch(job.videoUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const ext = isImageMode(job.mode)
        ? blob.type.split("/")[1] || "png"
        : "mp4";
      const a = document.createElement("a");
      a.href = url;
      a.download = `frame-0_${job.id.slice(0, 8)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      flash(zh ? "下载失败" : "Download failed");
    }
  }

  // 送去工坊复用：rerun 直接载参数；i2v/ve 设一次性信号，跳转后由 Studio mount 执行。
  function reuseInStudio(job: Job, action: "i2v" | "ve" | "rerun") {
    if (action === "rerun") loadJobIntoDraft(job.id);
    else setPendingReuse({ jobId: job.id, action });
    // 复用 = 创作新内容：清空选中任务，工坊到达时呈空预览 + 展开对话框（载入参数待生成）。
    selectJob(undefined);
    router.push(studioHref);
  }

  // 送去画布：把资产作为「成片节点」落在画布上，可直接分支(动画/编辑/变体)。
  function sendToCanvas(job: Job) {
    const draft = {
      mode: job.mode,
      modelId: job.modelId,
      params: { ...job.params },
      media: { ...job.media },
      prompt: job.prompt ?? "",
      negativePrompt: job.negativePrompt ?? "",
    };
    const n = useCanvasStore.getState().nodes.length;
    useCanvasStore.getState().addNode({
      x: 80 + (n % 4) * 320,
      y: 80 + Math.floor(n / 4) * 300,
      draft,
      jobId: job.id,
    });
    flash(zh ? "已放到画布 ⊞" : "Dropped on canvas ⊞");
    router.push(canvasHref);
  }

  // 资产 → 导演台：把成片作为「角色参考」塞进 R2V 草稿，跳导演台多镜创作。
  async function sendToDirector(job: Job) {
    const ok = await prepareDirectorFromJob(job, { zh, flash });
    if (ok) {
      flash(zh ? "已刷入导演台 🎬" : "Sent to Director 🎬");
      router.push(directorHref);
    }
  }

  function deleteOne(job: Job) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        zh ? "删除这个资产？不可恢复。" : "Delete this asset? This cannot be undone."
      )
    )
      return;
    deleteJob(job.id);
    flash(zh ? "已删除" : "Deleted");
  }

  function exportJson() {
    const picks = works.filter((w) => selected.has(w.id));
    const manifest = picks.map((w) => ({
      id: w.id,
      title: w.title,
      modelId: w.modelId,
      mode: w.mode,
      params: w.params,
      prompt: w.prompt,
      negativePrompt: w.negativePrompt,
      videoUrl: w.videoUrl,
      createdAt: new Date(w.createdAt).toISOString(),
      completedAt: w.completedAt
        ? new Date(w.completedAt).toISOString()
        : undefined,
      published: !!w.published,
    }));
    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `frame-0_archive_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function bulkUnpublish() {
    for (const id of selected) {
      const w = works.find((x) => x.id === id);
      if (w?.published) togglePublish(id);
    }
    clearSelection();
  }

  function bulkFavorite() {
    for (const id of selected) {
      const w = works.find((x) => x.id === id);
      if (w && !w.favorite) toggleFavorite(id);
    }
    clearSelection();
  }

  function bulkDelete() {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        zh
          ? `删除选中的 ${selected.size} 个资产？不可恢复。`
          : `Delete ${selected.size} selected assets? This cannot be undone.`
      )
    )
      return;
    for (const id of selected) deleteJob(id);
    exitSelect();
    flash(zh ? "已删除" : "Deleted");
  }

  const homeHref = locale === "zh" ? "/" : "/en";
  const studioHref = locale === "zh" ? "/studio" : "/en/studio";
  const canvasHref = locale === "zh" ? "/canvas" : "/en/canvas";
  const directorHref = locale === "zh" ? "/director" : "/en/director";
  const helpHref = locale === "zh" ? "/help" : "/en/help";

  const sizedWorks = useMemo(
    () =>
      works.map((w, i) => ({
        ...w,
        size:
          view === "editorial"
            ? editorialSize(i)
            : view === "grid"
              ? ("m" as const)
              : ("s" as const),
      })),
    [works, view]
  );
  const visibleKey = `${searchNeedle}\u0000${categoryFilter}\u0000${typeFilter}\u0000${modeFilter}\u0000${sortBy}\u0000${favOnly}\u0000${activeTagFilter ?? ""}\u0000${view}`;
  const [visibleState, setVisibleState] = useState({ key: "", count: ARCHIVE_PAGE_SIZE });
  const effectiveVisibleCount = visibleState.key === visibleKey ? visibleState.count : ARCHIVE_PAGE_SIZE;

  const visibleWorks = useMemo(
    () => sizedWorks.slice(0, effectiveVisibleCount),
    [sizedWorks, effectiveVisibleCount]
  );
  const hasMoreWorks = visibleWorks.length < sizedWorks.length;
  const showMoreWorks = () => {
    setVisibleState((state) => {
      const current = state.key === visibleKey ? state.count : ARCHIVE_PAGE_SIZE;
      return {
        key: visibleKey,
        count: Math.min(current + ARCHIVE_PAGE_SIZE, sizedWorks.length),
      };
    });
  };

  return (
    <div className="app" style={{ minHeight: "100vh" }}>
      {/* Chrome */}
      <header className="chrome">
        <div className="left">
          <Link
            href={homeHref}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="logo">
              Frame<span style={{ color: "var(--accent)" }}>/</span>0{" "}
              <b>LIBRARY</b>
            </div>
          </Link>
        </div>
        <TopNav current="archive" />
        <div className="right">
          <Link prefetch={false} href={helpHref} className="chrome-icon" title={locale === "zh" ? "帮助" : "Help"} style={{ textDecoration: "none" }}>?</Link>
          <LocaleSwitcher />
          <span className="tag">
            <span className="dot" /> {t("chrome.rolling_badge")}
          </span>
        </div>
      </header>

      <section className="scene on">
        <div className="archive">
          <div className="ar-head">
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--accent)",
                  marginBottom: 12,
                }}
              >
                {t("archive.kicker")}
              </div>
              <h2>
                {t("archive.title_prefix")}{" "}
                <em>{t("archive.title_italic")}</em>{" "}
                {t.has("archive.title_suffix") ? t("archive.title_suffix") : ""}
              </h2>
              <p
                style={{
                  marginTop: 16,
                  maxWidth: "52ch",
                  color: "var(--paper-dim)",
                  fontSize: 15,
                  lineHeight: 1.5,
                }}
              >
                {t("archive.lead")}
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="arch-select-btn arch-upload-btn"
                onClick={() => uploadRef.current?.click()}
                title={zh ? "上传本地图片 / 视频到资产库" : "Upload local media"}
              >
                ⬆ {zh ? "上传素材" : "Upload"}
              </button>
              <input
                ref={uploadRef}
                type="file"
                accept="image/*,video/*"
                multiple
                hidden
                onChange={(e) => {
                  void handleUploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="arch-select-btn"
                onClick={() => setManualOpen(true)}
                title={zh ? "录入外部视频" : "Add external entry"}
              >
                + {zh ? "录入" : "Add"}
              </button>
              <button
                type="button"
                className="arch-select-btn"
                onClick={() => fileRef.current?.click()}
                title={zh ? "从 JSON 清单批量导入" : "Bulk import JSON"}
              >
                + {zh ? "导入 JSON" : "Import JSON"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportFile(f);
                  e.target.value = "";
                }}
              />
              {works.length > 0 && (
                <button
                  type="button"
                  className={`arch-select-btn${selectMode ? " on" : ""}`}
                  onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                >
                  {selectMode
                    ? zh ? "完成" : "Done"
                    : zh ? "多选" : "Select"}
                </button>
              )}
              <div className="toggle" role="tablist" aria-label="view mode">
                <button
                  className={view === "editorial" ? "on" : ""}
                  onClick={() => setView("editorial")}
                  type="button"
                >
                  {t("archive.mode_editorial")}
                </button>
                <button
                  className={view === "grid" ? "on" : ""}
                  onClick={() => setView("grid")}
                  type="button"
                >
                  {t("archive.mode_grid")}
                </button>
                <button
                  className={view === "strip" ? "on" : ""}
                  onClick={() => setView("strip")}
                  type="button"
                >
                  {t("archive.mode_strip")}
                </button>
              </div>
            </div>
          </div>

          {/* 资产分类 tab */}
          <div className="ar-category-tabs">
            {CATEGORY_TABS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`ar-cat-tab${categoryFilter === c.id ? " on" : ""}`}
                onClick={() => applyCategoryFilter(c.id)}
              >
                <span className="ar-cat-icon">{c.icon}</span>
                {locale === "zh" ? c.zh : c.en}
                {c.id !== "all" && (
                  <span className="ar-cat-count">
                    {categoryCounts[c.id]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* 资产库工具栏：搜索 + 类型 + 模式 + 排序 + 计数 */}
          <div className="ar-toolbar">
            <div className="ar-search">
              <span className="ar-search-ico" aria-hidden>⌕</span>
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  clearSelectionForFilter();
                  setQuery(e.target.value);
                }}
                placeholder={
                  zh ? "搜索标题 / prompt / 模型…" : "Search title / prompt / model…"
                }
              />
              {query && (
                <button
                  type="button"
                  className="ar-search-x"
                  onClick={() => {
                    clearSelectionForFilter();
                    setQuery("");
                  }}
                  aria-label="clear search"
                >
                  ×
                </button>
              )}
            </div>
            <div className="ar-chips" role="tablist" aria-label="type filter">
              {(
                [
                  ["all", zh ? "全部" : "All"],
                  ["video", zh ? "视频" : "Video"],
                  ["image", zh ? "图片" : "Image"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  className={`ar-chip${typeFilter === v ? " on" : ""}`}
                  onClick={() => applyTypeFilter(v)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`ar-chip ar-fav-toggle${favOnly ? " on" : ""}`}
              onClick={() => {
                clearSelectionForFilter();
                setFavOnly((v) => !v);
              }}
              title={zh ? "只看收藏" : "Favorites only"}
            >
              ★ {zh ? "收藏" : "Favorites"}
            </button>
            <select
              className="ar-mode-sel"
              value={modeFilter}
              onChange={(e) => applyModeFilter(e.target.value as "all" | Mode)}
              title={zh ? "按生成模式筛选" : "Filter by mode"}
            >
              {filteredModeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{zh ? opt.zh : opt.en}</option>
              ))}
            </select>
            {tagOptions.length > 0 && (
              <select
                className="ar-mode-sel"
                value={activeTagFilter ?? ""}
                onChange={(e) => applyTagFilter(e.target.value || null)}
                title={zh ? "按标签筛选" : "Filter by tag"}
              >
                <option value="">{zh ? "全部标签" : "All tags"}</option>
                {tagOptions.map((t) => (
                  <option key={t} value={t}>
                    #{t}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="ar-chip ar-sort"
              onClick={() => setSortBy((s) => (s === "new" ? "old" : "new"))}
              title={zh ? "切换排序" : "Toggle sort"}
            >
              {sortBy === "new"
                ? zh ? "↓ 最新" : "↓ Newest"
                : zh ? "↑ 最早" : "↑ Oldest"}
            </button>
            <div className="ar-count">
              {works.length}
              {activeFilterCount > 0
                ? ` / ${allAssets.length}`
                : ""}{" "}
              {zh ? "项" : ""}
            </div>
            {activeFilterCount > 0 && (
              <button type="button" className="ar-clear" onClick={clearArchiveFilters}>
                {zh ? `清空 ${activeFilterCount}` : `Clear ${activeFilterCount}`}
              </button>
            )}
          </div>

          {selectMode && (
            <div className="arch-selection-bar">
              <div className="arch-sel-info">
                <b>{selected.size}</b>
                <span>/ {works.length}</span>
                <span className="arch-sel-label">
                  {zh ? "已选择" : "selected"}
                </span>
                {selected.size < works.length ? (
                  <button type="button" className="arch-sel-link" onClick={selectAll}>
                    {zh ? "全选" : "Select all"}
                  </button>
                ) : (
                  <button type="button" className="arch-sel-link" onClick={clearSelection}>
                    {zh ? "清空" : "Clear"}
                  </button>
                )}
              </div>
              <div className="arch-sel-actions">
                <button
                  type="button"
                  className="arch-sel-btn"
                  onClick={downloadSelected}
                  disabled={selected.size === 0}
                  title={zh ? "依次下载每个 MP4" : "Download each MP4 sequentially"}
                >
                  ↓ {zh ? `下载 (${selected.size})` : `Download (${selected.size})`}
                </button>
                <button
                  type="button"
                  className="arch-sel-btn"
                  onClick={bulkFavorite}
                  disabled={selected.size === 0}
                  title={zh ? "收藏选中" : "Favorite selected"}
                >
                  ★ {zh ? "收藏" : "Favorite"}
                </button>
                <button
                  type="button"
                  className="arch-sel-btn arch-sel-danger"
                  onClick={bulkDelete}
                  disabled={selected.size === 0}
                  title={zh ? "删除选中（不可恢复）" : "Delete selected"}
                >
                  🗑 {zh ? "删除" : "Delete"}
                </button>
                <button
                  type="button"
                  className="arch-sel-btn"
                  onClick={exportJson}
                  disabled={selected.size === 0}
                  title={zh ? "导出 JSON 清单（模型/参数/prompt/URL）" : "Export JSON manifest"}
                >
                  ⎘ {zh ? "导出 JSON" : "Export JSON"}
                </button>
                <button
                  type="button"
                  className="arch-sel-btn"
                  onClick={bulkUnpublish}
                  disabled={selected.size === 0}
                >
                  {zh ? "批量取消发布" : "Unpublish all"}
                </button>
              </div>
            </div>
          )}

          {allAssets.length === 0 ? (
            <EmptyState locale={locale} studioHref={studioHref} />
          ) : works.length === 0 ? (
            <div className="ar-noresult">
              {zh
                ? "没有匹配的资产 —— 换个筛选或清空搜索试试。"
                : "No matching assets — try a different filter or clear the search."}
            </div>
          ) : view === "strip" ? (
            <>
              <StripView works={visibleWorks} locale={locale} t={t} />
              <ArchiveLoadMore
                show={hasMoreWorks}
                visible={visibleWorks.length}
                total={works.length}
                zh={zh}
                onClick={showMoreWorks}
              />
            </>
          ) : (
            <>
              <div
                className={`works works-dense${dragActive ? " works-drag" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!dragActive) setDragActive(true);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget === e.target) setDragActive(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  void handleUploadFiles(e.dataTransfer.files);
                }}
              >
                {visibleWorks.map((w, i) => (
                  <WorkCard
                    key={w.id}
                    job={w}
                    size={w.size}
                    locale={locale}
                    t={t}
                    zh={zh}
                    mediaPriority={i < ARCHIVE_MEDIA_EAGER}
                    onTogglePublish={() => togglePublish(w.id)}
                    onToggleFavorite={() => toggleFavorite(w.id)}
                    onDownload={() => void downloadOne(w)}
                    onDelete={() => deleteOne(w)}
                    onReuse={(action) => reuseInStudio(w, action)}
                    onSendToCanvas={() => sendToCanvas(w)}
                    onSendToDirector={() => sendToDirector(w)}
                    onEdit={() => setEditJob(w)}
                    onTagClick={(tg) => setTagFilter(tg)}
                    selectMode={selectMode}
                    selected={selected.has(w.id)}
                    onToggleSelect={() => toggleSelect(w.id)}
                  />
                ))}
              </div>
              <ArchiveLoadMore
                show={hasMoreWorks}
                visible={visibleWorks.length}
                total={works.length}
                zh={zh}
                onClick={showMoreWorks}
              />
            </>
          )}
        </div>
      </section>

      {maintenanceReady && <ArchiveMaintenance />}

      <ManualEntryModal
        open={manualOpen}
        zh={zh}
        onClose={() => setManualOpen(false)}
        onCreated={() => flash(zh ? "已添加到档案 ⭐" : "Added to archive ⭐")}
      />

      <AssetEditModal
        job={editJob}
        zh={zh}
        allTags={allTags}
        onClose={() => setEditJob(null)}
        onSave={(patch) => {
          if (editJob) {
            setJobTitle(editJob.id, patch.title);
            setJobTags(editJob.id, patch.tags);
            setJobNote(editJob.id, patch.note);
            if (patch.category) useStudioStore.getState().setJobCategory(editJob.id, patch.category);
          }
          setEditJob(null);
          flash(zh ? "已保存 ✎" : "Saved ✎");
        }}
      />

      {toast && <div className="arch-toast">{toast}</div>}

      <style jsx global>{`
        .strip-rail {
          display: flex;
          gap: 14px;
          overflow-x: auto;
          padding-bottom: 16px;
          scroll-snap-type: x mandatory;
        }
        .strip-rail::-webkit-scrollbar { height: 8px; }
        .strip-rail::-webkit-scrollbar-thumb {
          background: var(--line);
          border-radius: 4px;
        }
        .arch-strip-cell {
          flex: 0 0 280px;
          scroll-snap-align: start;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        /* Selection toggle button */
        .arch-select-btn {
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper);
          padding: 8px 14px;
          font-family: var(--mono);
          font-size: 10.5px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
          border-radius: 999px;
        }
        .arch-select-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
        }
        .arch-select-btn.on {
          background: var(--accent);
          color: var(--ink);
          border-color: var(--accent);
        }

        /* Selection bar */
        .arch-selection-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 14px 20px;
          margin-bottom: 24px;
          background: color-mix(in oklab, var(--accent) 10%, var(--ink-2));
          border: 1px solid var(--accent);
          flex-wrap: wrap;
        }
        .arch-sel-info {
          display: flex;
          align-items: baseline;
          gap: 8px;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--paper);
        }
        .arch-sel-info b {
          font-size: 20px;
          color: var(--accent);
          font-family: var(--serif);
          font-style: italic;
          font-weight: 400;
        }
        .arch-sel-label {
          color: var(--paper-mute);
        }
        .arch-sel-link {
          background: transparent;
          border: none;
          color: var(--accent);
          font: inherit;
          padding: 0 0 0 8px;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .arch-sel-actions {
          display: flex;
          gap: 6px;
        }
        .arch-sel-btn {
          background: transparent;
          border: 1px solid var(--accent);
          color: var(--accent);
          padding: 7px 14px;
          font-family: var(--mono);
          font-size: 10.5px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
          border-radius: 2px;
        }
        .arch-sel-btn:hover:not(:disabled) {
          background: var(--accent);
          color: var(--ink);
        }
        .arch-sel-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .arch-sel-danger {
          border-color: color-mix(in oklab, #c44 70%, var(--line));
          color: #d66;
        }
        .arch-sel-danger:hover:not(:disabled) {
          background: #c44;
          color: #fff;
        }

        /* Selectable + checked overlay on work cards */
        .work.selectable .fr {
          cursor: pointer;
          transition: transform 0.15s;
        }
        .work.selectable:hover .fr {
          transform: scale(0.98);
        }
        .work.selected .fr {
          outline: 3px solid var(--accent);
          outline-offset: -3px;
        }
        .work-check {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 28px;
          height: 28px;
          border: 2px solid var(--paper);
          background: rgba(0, 0, 0, 0.4);
          display: grid;
          place-items: center;
          font-family: var(--mono);
          font-size: 16px;
          color: var(--paper);
          backdrop-filter: blur(6px);
          z-index: 3;
        }
        .work.selected .work-check {
          background: var(--accent);
          border-color: var(--accent);
          color: var(--ink);
        }

        /* Source badge (manual / imported) on work thumbnails */
        .source-badge {
          position: absolute;
          bottom: 10px;
          left: 12px;
          padding: 3px 8px;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(6px);
          color: var(--accent);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          border: 1px solid var(--accent);
          z-index: 2;
        }

        /* Page-level toast for archive */
        .arch-toast {
          position: fixed;
          top: 90px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--paper);
          color: var(--ink);
          padding: 10px 20px;
          font-family: var(--mono);
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          z-index: 90;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
          animation: arch-toast-in 0.18s ease-out;
        }
        @keyframes arch-toast-in {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-8px);
          }
        }
        .arch-strip-cell .fr {
          aspect-ratio: 16/10;
          position: relative;
          overflow: hidden;
          background: black;
        }
        .arch-strip-cell .meta {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--paper-mute);
        }
        .arch-strip-cell h4 {
          margin: 0;
          font-family: var(--serif);
          font-style: italic;
          font-size: 18px;
          line-height: 1.15;
          color: var(--paper);
          font-weight: 400;
        }
        .empty-archive {
          border: 1px dashed var(--line);
          padding: 80px 32px;
          text-align: center;
          color: var(--paper-dim);
        }
        .empty-archive h3 {
          font-family: var(--serif);
          font-size: 28px;
          font-style: italic;
          font-weight: 400;
          margin: 0 0 12px;
          color: var(--paper);
        }
        .empty-archive a {
          display: inline-block;
          margin-top: 20px;
          padding: 10px 18px;
          border: 1px solid var(--accent);
          color: var(--accent);
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          text-decoration: none;
        }
      `}</style>
    </div>
  );
}

function ArchiveMaintenance() {
  useLocalJobRehydration();
  useJobAutoBackup();
  useLocalVideoRecovery();
  useStateBackup();
  return null;
}

function ArchiveLoadMore({
  show,
  visible,
  total,
  zh,
  onClick,
}: {
  show: boolean;
  visible: number;
  total: number;
  zh: boolean;
  onClick: () => void;
}) {
  if (!show) return null;
  return (
    <div className="arch-load-more">
      <button type="button" onClick={onClick}>
        {zh ? "加载更多" : "Load more"}
      </button>
      <span>{visible} / {total}</span>
    </div>
  );
}

function WorkCard({
  job,
  size,
  locale,
  t,
  zh,
  onTogglePublish,
  onToggleFavorite,
  onDownload,
  onDelete,
  onReuse,
  onSendToCanvas,
  onSendToDirector,
  onEdit,
  onTagClick,
  selectMode,
  selected,
  onToggleSelect,
  mediaPriority = false,
}: {
  job: Job;
  size: "xl" | "l" | "m" | "s";
  locale: string;
  t: ReturnType<typeof useTranslations>;
  zh: boolean;
  onTogglePublish: () => void;
  onToggleFavorite: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onReuse: (action: "i2v" | "ve" | "rerun") => void;
  onSendToCanvas: () => void;
  onSendToDirector: () => void;
  onEdit: () => void;
  onTagClick: (tag: string) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  mediaPriority?: boolean;
}) {
  const isImage = isImageMode(job.mode);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaNear, setMediaNear] = useState(mediaPriority);
  const [mediaHot, setMediaHot] = useState(false);
  const shouldLoadMedia = mediaPriority || mediaNear || mediaHot;

  useEffect(() => {
    if (mediaPriority) return;
    if (mediaNear) return;
    const el = frameRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMediaNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "420px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mediaNear, mediaPriority]);

  useEffect(() => {
    if (!mediaHot || selectMode || isImage) return;
    const video = videoRef.current;
    if (!video) return;
    void video.play().catch(() => {});
  }, [isImage, mediaHot, selectMode, shouldLoadMedia]);

  return (
    <article
      className={`work ${size}${selectMode ? " selectable" : ""}${selected ? " selected" : ""}`}
      onClick={selectMode && onToggleSelect ? onToggleSelect : undefined}
      style={{ cursor: selectMode ? "pointer" : undefined }}
    >
      <div
        ref={frameRef}
        className="fr"
        style={{ background: "black" }}
        onMouseEnter={() => setMediaHot(true)}
        onMouseLeave={() => {
          if (selectMode) return;
          setMediaHot(false);
          const video = videoRef.current;
          if (video) {
            video.pause();
            try {
              video.currentTime = 0.1;
            } catch {
              /* ignore */
            }
          }
        }}
      >
        {job.videoUrl && isImage && shouldLoadMedia ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={job.videoUrl}
            className="img"
            alt={job.title}
            loading={mediaPriority ? "eager" : "lazy"}
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : job.videoUrl && !isImage && shouldLoadMedia ? (
          <video
            ref={videoRef}
            src={`${job.videoUrl}#t=0.1`}
            className="img"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            muted
            loop
            playsInline
            preload={mediaHot ? "auto" : "metadata"}
          />
        ) : null}
        {!shouldLoadMedia && <div className="arch-media-ph" />}
        <div className="ovr" />
        <div className="run">{job.modelId.split("/").pop()}</div>
        <div className="dur">
          {job.params.duration ? `${job.params.duration}s` : ""}
        </div>
        {(job.source === "manual" || job.source === "imported") && (
          <div className="source-badge" title={job.sourceLabel}>
            {job.source === "manual" ? "⊕ 手录" : "⇲ 导入"}
          </div>
        )}
        {selectMode && (
          <div className="work-check" aria-hidden>
            {selected ? "✓" : ""}
          </div>
        )}
        {job.favorite && !selectMode && (
          <div className="work-fav" aria-hidden>
            ★
          </div>
        )}
        {!selectMode && (
          <div
            className="work-actions"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={`wa-btn${job.favorite ? " on" : ""}`}
              onClick={onToggleFavorite}
              title={zh ? "收藏" : "Favorite"}
            >
              ★
            </button>
            <button
              type="button"
              className="wa-btn"
              onClick={onDownload}
              title={zh ? "下载" : "Download"}
            >
              ↓
            </button>
            <button
              type="button"
              className="wa-btn"
              onClick={() => onReuse("rerun")}
              title={zh ? "用这套参数再来一条" : "Re-run with same params"}
            >
              ↻
            </button>
            <button
              type="button"
              className="wa-btn wa-accent"
              onClick={() => onReuse(isImage ? "i2v" : "ve")}
              title={
                isImage
                  ? zh ? "用此图生成视频" : "Animate → I2V"
                  : zh ? "编辑此视频" : "Edit this video"
              }
            >
              {isImage ? "🎞" : "✂"}
            </button>
            <button
              type="button"
              className="wa-btn"
              onClick={onSendToCanvas}
              title={zh ? "放到画布 —— 作为节点分支创作" : "Drop on canvas as a node"}
            >
              ⊞
            </button>
            <button
              type="button"
              className="wa-btn"
              onClick={onSendToDirector}
              title={zh ? "送去导演台 —— 作为角色参考多镜创作" : "Send to Director as a character ref"}
            >
              🎭
            </button>
            <button
              type="button"
              className="wa-btn"
              onClick={onEdit}
              title={zh ? "编辑 —— 改名 / 标签 / 备注" : "Edit — title / tags / note"}
            >
              ✎
            </button>
            <button
              type="button"
              className="wa-btn wa-danger"
              onClick={onDelete}
              title={zh ? "删除" : "Delete"}
            >
              🗑
            </button>
          </div>
        )}
      </div>
      <h3>{job.title}</h3>
      {!!job.tags?.length && (
        <div className="work-tags">
          {job.tags.map((tg) => (
            <button
              key={tg}
              type="button"
              className="work-tag"
              onClick={(e) => {
                e.stopPropagation();
                onTagClick(tg);
              }}
              title={zh ? `按标签「${tg}」筛选` : `Filter by ${tg}`}
            >
              #{tg}
            </button>
          ))}
        </div>
      )}
      <div className="by">
        {t("archive.signed_by")} <b>YOU</b> · <b>{job.sourceLabel || job.modelId.split("/").pop()}</b>
        {job.published && (
          <>
            {" · "}
            <button
              type="button"
              onClick={onTogglePublish}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--accent)",
                cursor: "pointer",
                font: "inherit",
                padding: 0,
              }}
              title="Unpublish"
            >
              ★ PUBLISHED
            </button>
          </>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--paper-mute)",
          marginTop: 6,
        }}
      >
        {fmtDate(job.completedAt ?? job.createdAt, locale)}
      </div>
    </article>
  );
}

function StripView({
  works,
  locale,
  t,
}: {
  works: Job[];
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="strip-rail">
      {works.map((w) => (
        <div className="arch-strip-cell" key={w.id}>
          <div className="fr">
            {w.videoUrl && (
              <video
                src={`${w.videoUrl}#t=0.1`}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
                muted
                loop
                playsInline
                preload="none"
                onMouseEnter={(e) => {
                  e.currentTarget.preload = "auto";
                  void e.currentTarget.play().catch(() => {});
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.pause();
                  e.currentTarget.currentTime = 0.1;
                }}
              />
            )}
          </div>
          <div className="meta">{w.modelId.split("/").pop()}</div>
          <h4>{w.title}</h4>
          <div className="meta" style={{ opacity: 0.7 }}>
            {fmtDate(w.completedAt ?? w.createdAt, locale)}
            {w.published && (
              <>
                {" · "}
                <span style={{ color: "var(--accent)" }}>
                  {t("archive.c2pa")}
                </span>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  locale,
  studioHref,
}: {
  locale: string;
  studioHref: string;
}) {
  const zh = locale === "zh";
  return (
    <div className="empty-archive">
      <h3>{zh ? "档案空空如也" : "The archive is empty"}</h3>
      <p style={{ maxWidth: "44ch", margin: "0 auto" }}>
        {zh
          ? "回到工坊，生成一段视频并点击 Publish，它就会出现在这里。"
          : "Head back to the studio, generate a clip, hit Publish — it'll appear here."}
      </p>
      <Link href={studioHref}>{zh ? "进入工坊 →" : "Enter studio →"}</Link>
    </div>
  );
}
