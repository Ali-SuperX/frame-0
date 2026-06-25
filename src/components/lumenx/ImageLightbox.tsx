/**
 * LumenX —— 全屏 Lightbox。
 *
 * 由 useLumenStore.lightbox 单例驱动；任何位置（角色卡、分镜行、ChatPanel 等）
 * 调用 openLightbox({ url, mediaType, target?, title? }) 即可弹出。
 *
 * 行为：
 *  - 点击遮罩 / Esc → 关闭
 *  - 底部「在对话中编辑」→ 调 inspectAsset(target) 并关闭，让 ChatPanel 进入检视模式
 *  - target 缺失（旧资产无 generationMeta）→ 隐藏「编辑」按钮，仅作大图查看
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useLumenStore } from "@/lib/lumenx/store";

export default function ImageLightbox() {
  const lightbox = useLumenStore((s) => s.lightbox);
  const closeLightbox = useLumenStore((s) => s.closeLightbox);
  const inspectAsset = useLumenStore((s) => s.inspectAsset);
  const [scale, setScale] = useState(1);
  const mediaRef = useRef<HTMLDivElement>(null);

  // Reset scale when lightbox changes
  useEffect(() => {
    setScale(1);
  }, [lightbox?.url]);

  // Esc 关闭
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, closeLightbox]);

  // Scroll wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((prev) => {
      const next = prev - e.deltaY * 0.001;
      return Math.min(5, Math.max(0.5, next));
    });
  }, []);

  if (!lightbox) return null;

  const onBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) closeLightbox();
  };

  const onEdit = () => {
    if (!lightbox.target) return;
    inspectAsset(lightbox.target);
    closeLightbox();
  };

  return (
    <div
      className="lx-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="资产预览"
      onMouseDown={onBackdrop}
    >
      <button
        type="button"
        className="lx-lightbox-close"
        onClick={closeLightbox}
        aria-label="关闭"
        title="关闭 (Esc)"
      >
        ×
      </button>

      <div className="lx-lightbox-stage" onMouseDown={(e) => e.stopPropagation()}>
        {lightbox.title && (
          <div className="lx-lightbox-title">{lightbox.title}</div>
        )}
        <div
          className="lx-lightbox-media"
          ref={mediaRef}
          onWheel={handleWheel}
        >
          {lightbox.mediaType === "video" ? (
            <video
              src={lightbox.url}
              controls
              autoPlay
              playsInline
              loop
              className="lx-lightbox-video"
              style={{ transform: `scale(${scale})`, transition: 'transform 0.1s ease' }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lightbox.url}
              alt={lightbox.title ?? "预览"}
              className="lx-lightbox-image"
              style={{ transform: `scale(${scale})`, transition: 'transform 0.1s ease', cursor: scale > 1 ? 'grab' : 'zoom-in' }}
            />
          )}
        </div>

        <div className="lx-lightbox-toolbar">
          {lightbox.target ? (
            <button
              type="button"
              className="lx-lightbox-btn primary"
              onClick={onEdit}
              title="把生成参数回填到右侧对话面板，可调整后重新生成"
            >
              ✨ 在对话中编辑
            </button>
          ) : (
            <span className="lx-lightbox-hint">
              该资产无生成上下文，仅作放大查看
            </span>
          )}
          <a
            href={lightbox.url}
            target="_blank"
            rel="noreferrer"
            className="lx-lightbox-btn ghost"
            title="在新标签打开"
          >
            ↗ 新窗口打开
          </a>
          <button
            type="button"
            className="lx-lightbox-btn ghost"
            onClick={closeLightbox}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
