"use client";

/**
 * 中央银幕 —— 「所见即所编」创作台。
 * 当前镜即编辑焦点：点画面出图、点字幕改旁白、点 slate 调运镜/时长。
 * 高级编辑（台词/角色绑定/一致性）走「详细」→ Inspector。
 * editable=false（示例片）时退化为只读展示。
 */
import { useEffect, useRef, useState } from "react";
import type { StageShot } from "@/lib/store";
import { MOVE_ZH, SHOT_TYPES, pad2 } from "./config";
import { ChevronIcon } from "./icons";
import { MediaLayer, SubtitleContent } from "./parts";
import type { CineShot } from "./types";

export function CinemaScreen({
  shot,
  idx,
  count,
  editable,
  generating,
  onPrev,
  onNext,
  onPatch,
  onGen,
  onOpenDetail,
}: {
  shot: CineShot;
  idx: number;
  count: number;
  editable: boolean;
  generating: string | null;
  onPrev: () => void;
  onNext: () => void;
  onPatch: (patch: Partial<StageShot>) => void;
  onGen: (kind: "image" | "voice" | "video") => void;
  onOpenDetail: () => void;
}) {
  const pending = shot.media.kind === "pending";
  const genImg = generating === `image-${shot.id}`;
  const genVid = generating === `video-${shot.id}`;
  const isDialogue = !!shot.speaker; // 台词镜：行内只读，改台词走详细

  const [editLine, setEditLine] = useState(false);
  const [draft, setDraft] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setEditLine(false); }, [shot.id]); // 切镜退出编辑
  useEffect(() => { if (editLine) taRef.current?.focus(); }, [editLine]);

  const startEditLine = () => {
    if (!editable || isDialogue) return;
    setDraft(shot.narration ?? "");
    setEditLine(true);
  };
  const commitLine = () => {
    setEditLine(false);
    if (draft !== (shot.narration ?? "")) onPatch({ narration: draft });
  };

  return (
    <main className="cn-stage">
      <button className="cn-nav prev" disabled={idx === 0} onClick={onPrev} aria-label="上一镜">
        <ChevronIcon dir="left" />
      </button>

      <figure className="cn-screen">
        <div key={shot.id} className={`cn-frame${pending ? " is-pending" : ""}`}>
          <MediaLayer shot={shot} fade />
          <span className="cn-frame-corners" aria-hidden />

          {/* 场记板：可编辑运镜 / 时长 */}
          <div className="cn-slate">
            {shot.size && (<>{shot.size}<span className="cn-sep">/</span></>)}
            {editable ? (
              <select
                className="cn-slate-sel"
                value={shot.shotType ?? "still"}
                onChange={(e) => onPatch({ shotType: e.target.value as StageShot["shotType"] })}
                title="运镜"
              >
                {SHOT_TYPES.map((t) => <option key={t} value={t}>{MOVE_ZH[t]}</option>)}
              </select>
            ) : (
              <span className="cn-slate-move">{shot.move}</span>
            )}
            <span className="cn-sep">/</span>
            {editable ? (
              <input
                className="cn-slate-num"
                type="number"
                min={0.5}
                step={0.1}
                value={shot.durSec}
                onChange={(e) => onPatch({ durationSec: Math.max(0.1, Number(e.target.value) || 0) })}
                title="时长(秒)"
              />
            ) : (
              shot.durSec.toFixed(1)
            )}
            s
          </div>

          <div className="cn-gauge">{shot.durSec.toFixed(1)}s</div>
          <div className="cn-frame-idx">{pad2(shot.idx)}</div>

          {/* 画面操作：出图 / 重出 / 出视频 / 详细 */}
          {editable && (
            <div className="cn-frame-tools">
              {pending ? (
                <button className="cn-tool-btn primary" disabled={genImg} onClick={() => onGen("image")}>
                  {genImg ? "出图中…" : "出图"}
                </button>
              ) : (
                <>
                  <button className="cn-tool-btn" disabled={genImg} onClick={() => onGen("image")}>{genImg ? "…" : "重出图"}</button>
                  <button className="cn-tool-btn" disabled={genVid} onClick={() => onGen("video")}>{genVid ? "…" : "出视频"}</button>
                </>
              )}
              <button className="cn-tool-btn" onClick={onOpenDetail} title="台词 / 角色绑定 / 一致性">详细</button>
            </div>
          )}

          {/* 待出图提示 */}
          {pending && (
            <div className="cn-pending">
              <span className="cn-pending-tag">待出图</span>
              {shot.prompt ? (
                <p className="cn-pending-prompt">{shot.prompt}</p>
              ) : (
                editable && <p className="cn-pending-prompt cn-muted">点「出图」生成画面</p>
              )}
            </div>
          )}
        </div>

        {/* 字幕：旁白行内可编辑 */}
        <figcaption className="cn-sub">
          {editLine ? (
            <textarea
              ref={taRef}
              className="cn-sub-edit"
              value={draft}
              rows={2}
              placeholder="写一句旁白…"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitLine}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commitLine();
                if (e.key === "Escape") setEditLine(false);
              }}
            />
          ) : (
            <span
              className={`cn-sub-text${shot.speaker ? " is-line" : ""}${editable && !isDialogue ? " is-editable" : ""}`}
              onClick={startEditLine}
              title={editable && !isDialogue ? "点击编辑旁白" : undefined}
            >
              {shot.line ? (
                <SubtitleContent shot={shot} />
              ) : editable ? (
                <span className="cn-sub-add">+ 加旁白</span>
              ) : (
                <span className="cn-sub-muted">（无台词）</span>
              )}
            </span>
          )}
        </figcaption>
      </figure>

      <button className="cn-nav next" disabled={idx === count - 1} onClick={onNext} aria-label="下一镜">
        <ChevronIcon dir="right" />
      </button>
    </main>
  );
}
