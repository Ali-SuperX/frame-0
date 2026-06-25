"use client";

import type { Job } from "@/lib/store";
import { isImageMode } from "@/lib/bailian/models";

/** "Bailian linked" / "API key needed" / "N running" tag in the chrome right area. */
export function RunningBadge({
  jobs,
  zh,
  hasKey,
  onConfigure,
}: {
  jobs: Job[];
  zh: boolean;
  hasKey: boolean;
  onConfigure: () => void;
}) {
  const running = jobs.filter(
    (j) => j.status === "running" || j.status === "submitting"
  ).length;
  if (running > 0) {
    return (
      <span
        className="tag running"
        title={zh ? "正在运行的任务" : "Running tasks"}
        style={{ borderColor: "var(--accent)" }}
      >
        <span className="dot pulsing" />
        {zh ? `${running} 个任务运行中` : `${running} running`}
      </span>
    );
  }
  /* 没配 key —— 徽章变成可点击的红色引导，点开设置弹窗 */
  if (!hasKey) {
    return (
      <button
        type="button"
        className="tag tag-nokey"
        onClick={onConfigure}
        title={zh ? "点击配置 API Key" : "Click to configure your API key"}
      >
        <span className="dot dot-warn" />
        {zh ? "未配置 Key" : "API key needed"}
      </button>
    );
  }
  return (
    <span
      className="tag"
      title="DashScope API"
      style={{ borderColor: "var(--accent)" }}
    >
      <span className="dot" />
      {zh ? "百炼已连" : "Bailian linked"}
    </span>
  );
}

/** Horizontal thumbnail strip below the main preview — click to activate. */
export function RecentStrip({
  jobs,
  activeId,
  onSelect,
}: {
  jobs: Job[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const recent = jobs.slice(0, 10);
  if (!recent.length) return null;
  return (
    <div className="strip">
      {recent.map((j) => (
        <div
          key={j.id}
          className={`strip-cell${j.id === activeId ? " active" : ""}`}
          onClick={() => onSelect(j.id)}
          title={j.title}
        >
          {j.status === "done" && j.videoUrl ? (
            isImageMode(j.mode) ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={j.videoUrl} alt="" />
            ) : (
              <video
                src={`${j.videoUrl}#t=0.1`}
                muted
                preload="none"
                playsInline
                onMouseEnter={(e) => {
                  e.currentTarget.preload = "auto";
                  void e.currentTarget.play().catch(() => {});
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.pause();
                  e.currentTarget.currentTime = 0.1;
                }}
              />
            )
          ) : (
            <div className="strip-ph">{j.status.toUpperCase()}</div>
          )}
        </div>
      ))}
    </div>
  );
}
