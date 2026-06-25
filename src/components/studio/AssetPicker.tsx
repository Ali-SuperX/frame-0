"use client";

/**
 * AssetPicker —— 从资产库(主 store 的成片 jobs)挑一个产出当输入媒体。
 * 按 accept 过滤图/视频，点选回调 onPick(job)；真正的「取字节 → 传 OSS」由
 * 调用方(MediaPicker)做，本组件只负责选。
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useStudioStore, type Job, type AssetCategory } from "@/lib/store";
import { isImageMode } from "@/lib/bailian/models";

type Props = {
  open: boolean;
  accept: "image" | "video" | "audio" | "image|video";
  zh?: boolean;
  /** 仅显示这些资产分类(画布复用角色/场景/道具用) */
  categories?: AssetCategory[];
  onClose: () => void;
  onPick: (job: Job) => void;
};

export default function AssetPicker({
  open,
  accept,
  zh = true,
  categories,
  onClose,
  onPick,
}: Props) {
  const jobs = useStudioStore((s) => s.jobs);
  const [query, setQuery] = useState("");
  // 仅客户端挂载后才 portal —— 保证 document.body 已就绪(SSR/HMR 安全)。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const assets = useMemo(() => {
    const wantImage = accept === "image" || accept === "image|video";
    const wantVideo = accept === "video" || accept === "image|video";
    const q = query.trim().toLowerCase();
    return jobs
      .filter((j) => j.status === "done" && !!j.videoUrl)
      .filter((j) => {
        const img = isImageMode(j.mode);
        return (img && wantImage) || (!img && wantVideo);
      })
      .filter((j) => !categories || (j.category != null && categories.includes(j.category)))
      .filter(
        (j) =>
          !q ||
          (j.title || "").toLowerCase().includes(q) ||
          (j.prompt || "").toLowerCase().includes(q)
      )
      .sort(
        (a, b) =>
          (b.completedAt ?? b.createdAt ?? 0) - (a.completedAt ?? a.createdAt ?? 0)
      );
  }, [jobs, accept, query, categories]);

  if (!open || !mounted) return null;

  // 渲染到 body：画布节点在 .cv-world(transform) 内会困住 position:fixed —— portal 逃出。
  return createPortal(
    <div className="ap-backdrop" onClick={onClose}>
      <div className="ap-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ap-head">
          <span className="ap-title">{zh ? "从资产库选" : "Pick from assets"}</span>
          <input
            className="ap-search"
            placeholder={zh ? "搜索 prompt / 标题" : "Search prompt / title"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button type="button" className="ap-x" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>

        {assets.length === 0 ? (
          <div className="ap-empty">
            {zh
              ? "资产库里还没有可用的成片"
              : "No matching assets in the library yet"}
          </div>
        ) : (
          <div className="ap-grid">
            {assets.map((j) => {
              const img = isImageMode(j.mode);
              return (
                <button
                  key={j.id}
                  type="button"
                  className="ap-cell"
                  onClick={() => onPick(j)}
                  title={j.title || j.prompt || ""}
                >
                  {img ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={j.videoUrl} alt={j.title || "asset"} loading="lazy" />
                  ) : (
                    <video src={`${j.videoUrl}#t=0.1`} muted preload="metadata" />
                  )}
                  <span className="ap-cell-cap">
                    {(j.title || j.prompt || "—").slice(0, 24)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
