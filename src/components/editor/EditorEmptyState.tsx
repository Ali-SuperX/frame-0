"use client";

import { useState } from "react";
import type { Job } from "@/lib/store";
import LazyVideoThumb from "../studio/LazyVideoThumb";

/**
 * 中央 dropzone — `/editor` 默认（L0）状态唯一交互。
 *
 * 接四种触发：
 *   - OS 文件拖入 → onDropFile
 *   - 工坊 job 拖入（`application/x-frame0-job` payload）→ onDropJob
 *   - 点击大区域 → onPickFile（弹文件选择器）
 *   - 点击工坊推荐缩略 → onPickJob
 *
 * 国际化：调用方传 zh。视觉用的都是已有 css var（--accent / --paper-mute /
 * --ink-2 / --line），不引入新颜色。拖入态用 `data-drag` attr 让 CSS 切换。
 */
export default function EditorEmptyState({
  zh,
  recentJobs,
  lastSession,
  onRestoreLastSession,
  onDropFile,
  onDropJob,
  onPickFile,
  onPickJob,
  onPasteUrl,
}: {
  zh: boolean;
  /** 最近 N 条已完成视频 job，会以 LazyVideoThumb 列出。 */
  recentJobs: Job[];
  /** store 里残留的上次未结束项目（如有），dropzone 顶部显示一行恢复入口。 */
  lastSession?: { clipCount: number; durationLabel: string };
  onRestoreLastSession?: () => void;
  onDropFile: (file: File) => void;
  /** 收 jobId（字符串）——跟 Editor 其它处一致的拖放协议；调用方按 id 找 job */
  onDropJob: (jobId: string) => void;
  /** 主点击/"选本地文件" chip — 弹文件选择器。 */
  onPickFile: () => void;
  onPickJob: (job: Job) => void;
  /** "粘贴 URL" chip — 把焦点跳到现有左 sidebar URL 输入框（由父组件实现）。 */
  onPasteUrl: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="ed-empty-stage">
      {lastSession && onRestoreLastSession && (
        <button
          type="button"
          className="ed-empty-restore"
          onClick={onRestoreLastSession}
          title={zh ? "回到上次未结束的项目" : "Resume last project"}
        >
          {zh
            ? `↻ 上次未结束（${lastSession.clipCount} 条 · ${lastSession.durationLabel}），点击恢复`
            : `↻ Resume last project (${lastSession.clipCount} clips · ${lastSession.durationLabel})`}
        </button>
      )}
      <div
        className={`ed-empty-drop${dragOver ? " over" : ""}`}
        onClick={onPickFile}
        onDragOver={(e) => {
          // 只接受 file 或 frame0-job 两种 payload
          const types = Array.from(e.dataTransfer.types);
          if (
            !types.includes("Files") &&
            !types.includes("application/x-frame0-job")
          )
            return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          // 工坊 job 优先（左 sidebar 和近作卡都用 jobId 字符串作为 payload）
          const jobId = e.dataTransfer.getData("application/x-frame0-job");
          if (jobId) {
            onDropJob(jobId);
            return;
          }
          const file = e.dataTransfer.files?.[0];
          if (file) onDropFile(file);
        }}
      >
        <div className="ed-empty-glyph">＋</div>
        <div className="ed-empty-title">
          {zh ? "拖入或点击添加视频开始" : "Drop or click to add a video"}
        </div>
        <div className="ed-empty-sub">
          {zh
            ? "支持 mp4 / mov / 图片 / 音频 · 也可粘贴 URL · 或从工坊选一条"
            : "mp4 / mov / image / audio · or paste a URL · or pick from Studio"}
        </div>
        <div className="ed-empty-chips" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="ed-empty-chip" onClick={onPickFile}>
            {zh ? "📁 选本地文件" : "📁 Pick file"}
          </button>
          <button type="button" className="ed-empty-chip" onClick={onPasteUrl}>
            {zh ? "🔗 粘贴 URL" : "🔗 Paste URL"}
          </button>
        </div>
      </div>

      {recentJobs.length > 0 && (
        <div className="ed-empty-recent">
          <div className="ed-empty-recent-head">
            {zh ? "工坊近作" : "Recent from Studio"}
          </div>
          <div className="ed-empty-recent-grid">
            {recentJobs.map((j) => (
              <button
                key={j.id}
                type="button"
                className="ed-empty-recent-card"
                title={j.title}
                onClick={() => onPickJob(j)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-frame0-job", j.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
              >
                {j.videoUrl && (
                  <LazyVideoThumb src={j.videoUrl} />
                )}
                <span className="ed-empty-recent-title">{j.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
