"use client";

import { useEffect, useState } from "react";
import type { JobMedia } from "@/lib/store";
import { readLocalFile } from "@/lib/editor/localFiles";

/**
 * 锚点参考图缩略图 —— 链式 / 单段延续面板里"源 job 参考图"那一栏复用。
 *
 * 渲染优先级（同 MediaTile）：
 *   1. 本会话内的 live blob URL（previewUrl）
 *   2. IDB rehydrate（localKey）
 *   3. localPath（/api/uploads/<sha>.png，服务端永久镜像）
 *   4. thumbDataUrl（仅 data:/http: 形式，blob: 视为脏字段忽略）
 *   5. ref.url 本身（仅 http(s)/data:/绝对路径）
 *   6. 都不行 → 数字占位符（不再显示破图 icon）
 *
 * 任何 src 加载失败（onError）都回退到占位符，杜绝浏览器原生裂图。
 */
export default function AnchorRefThumb({
  media,
  index,
  selected,
  onClick,
  fallbackName,
}: {
  media: JobMedia | string;
  /** 1-based 序号，用作占位符内容 */
  index: number;
  selected?: boolean;
  onClick?: () => void;
  /** 字符串形 media 时显示的名字 */
  fallbackName?: string;
}) {
  const m: JobMedia =
    typeof media === "string"
      ? { url: media, name: fallbackName ?? `ref${index}` }
      : media;

  const [rehydrated, setRehydrated] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // IDB rehydrate —— 当没有 live blob 但有 localKey 时去 IDB 拉原始字节
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setRehydrated(null);
    setFailed(false);
    const live = m.previewUrl?.startsWith("blob:") ? m.previewUrl : null;
    if (live || !m.localKey) return;
    (async () => {
      try {
        const blob = await readLocalFile(m.localKey!);
        if (!blob || cancelled) return;
        const typed = m.mime ? new Blob([blob], { type: m.mime }) : blob;
        createdUrl = URL.createObjectURL(typed);
        setRehydrated(createdUrl);
      } catch {
        /* ignore — falls back to localPath / thumb / placeholder */
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [m.localKey, m.previewUrl, m.mime]);

  const live = m.previewUrl?.startsWith("blob:") ? m.previewUrl : null;
  const safeThumb =
    m.thumbDataUrl && /^(data:|https?:)/.test(m.thumbDataUrl)
      ? m.thumbDataUrl
      : null;
  const safeLocalPath =
    m.localPath && /^(https?:|\/)/.test(m.localPath) ? m.localPath : null;
  const safeUrl = m.url && /^(https?:|data:|\/)/.test(m.url) ? m.url : null;
  const src = failed
    ? null
    : live || rehydrated || safeLocalPath || safeThumb || safeUrl;

  const name = m.name || fallbackName || `ref${index}`;

  return (
    <div
      className={`cont-studio-thumb${selected ? " cont-studio-thumb--on" : ""}`}
      onClick={onClick}
      title={name}
    >
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={src} alt={name} onError={() => setFailed(true)} />
      ) : (
        <span className="cont-studio-thumb-placeholder">{index}</span>
      )}
      <span className="cont-studio-thumb-label">{name}</span>
    </div>
  );
}
