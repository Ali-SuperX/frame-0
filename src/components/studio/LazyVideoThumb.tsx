"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 视口懒加载的视频缩略 —— jobs 列表用。
 *
 * 219 条 job 同时挂载 `<video preload="metadata">` 时，dev HTTP/1.1 6 并发
 * 上限会把请求排队几十秒。这里只在元素**真正进入视口**时才把 src 设上去，
 * 让浏览器对当前可见区域优先发请求；离开视口后保留 src（已下载完的资源
 * 不需要再丢，避免反复回到列表造成重复下载）。
 *
 * 另外保留原 hover 自动播放体验：进入视口的 video 鼠标 hover 时 play()，
 * 移出 pause() + 回到第 0.1s。
 */
export default function LazyVideoThumb({
  src,
  className,
}: {
  /** 完整 video URL（不带 fragment）。 */
  src: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || active) return;
    // 提前 200px 触发，让用户滚动到时缩略图通常已经就位
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setActive(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [active]);

  return (
    <video
      ref={ref}
      // 进视口前 src 留空 —— 浏览器不会发任何网络请求
      src={active ? `${src}#t=0.1` : undefined}
      className={className}
      muted
      preload="metadata"
      playsInline
      onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
      onMouseLeave={(e) => {
        e.currentTarget.pause();
        e.currentTarget.currentTime = 0.1;
      }}
    />
  );
}
