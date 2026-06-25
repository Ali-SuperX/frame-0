"use client";

import { useEffect, useState } from "react";
import { readLocalFile } from "@/lib/editor/localFiles";

/**
 * 图片任务（t2i/i2i）的渲染兜底 —— 跟视频版 LazyVideoThumb 一对孪生。
 *
 * 加载顺序：
 *   1. 直接用 src（generation 接口最初返回的远程 URL，备份后会 swap 为 blob:）
 *   2. src 加载失败（onError）后从 IDB 用 localKey 拉回原始字节重新 createObjectURL
 *   3. 还失败：显示一个友好的 "图片源已过期 / 请重新生成" 占位，**不再让浏览器
 *      露出原生 broken-image 图标**
 *
 * dashscope 图片 URL 1 小时即过期，备份机制偶有失败 / 旧 job 无备份 / 备份的 blob
 * URL 跨 session 失效都会引发裂图。这一个组件覆盖以上全部 case。
 */
export default function JobImage({
  src,
  alt,
  localKey,
  className,
  style,
}: {
  src: string | undefined;
  alt: string;
  localKey?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [rehydrated, setRehydrated] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [primaryDead, setPrimaryDead] = useState(false);

  /**
   * src 变化时全量重置 ——
   * 关键 race condition：刚 done 的 job 第一次写入 videoUrl 可能是临时态（如
   * 还没经过 mirrorImagesToDisk 镜像 / 备份钩子还没跑），首次加载偶尔失败
   * 触发 setPrimaryDead/setFailed。若 store 后续 swap 为新 URL，本组件原本
   * 没有依赖 src 的重置 effect，三个状态卡死 → 永远 fallback。
   *
   * 同一条 job 在中央 PreviewPanel + 左侧 jobs 列表两处渲染时，行为分歧也
   * 来源于此 —— 谁第一次撞 race 谁就被永久 fallback。
   */
  useEffect(() => {
    setPrimaryDead(false);
    setFailed(false);
    setRehydrated(null);
  }, [src]);

  // rehydrated blob URL 的生命周期 —— 离开当前值时释放，防内存泄漏
  useEffect(() => {
    if (!rehydrated) return;
    return () => {
      URL.revokeObjectURL(rehydrated);
    };
  }, [rehydrated]);

  // 主 src 失效后从 IDB 重建 blob URL
  useEffect(() => {
    if (!primaryDead || !localKey || rehydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const blob = await readLocalFile(localKey);
        if (!blob || cancelled) return;
        setRehydrated(URL.createObjectURL(blob));
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [primaryDead, localKey, rehydrated]);

  const effectiveSrc = rehydrated || (primaryDead ? null : src);

  if (failed || !effectiveSrc) {
    return (
      <div
        className={`job-image-fallback ${className ?? ""}`}
        title={alt}
        style={style}
      >
        <span className="job-image-fallback-glyph">🖼</span>
        <span className="job-image-fallback-text">图片源已失效</span>
        <span className="job-image-fallback-hint">请重新生成</span>
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={effectiveSrc}
      alt={alt}
      className={className}
      style={style}
      onError={() => {
        // primary failed → 触发 IDB rehydrate，再失败就走 fallback UI
        if (!primaryDead) setPrimaryDead(true);
        else if (!failed) setFailed(true);
      }}
    />
  );
}
