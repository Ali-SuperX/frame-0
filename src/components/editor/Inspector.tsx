"use client";

import { useState, type ReactNode, type SVGProps } from "react";
import type {
  EditorClip,
  EditorTextOverlay,
} from "@/lib/store";

/**
 * 右侧 Inspector —— **上下文感知**:选什么类型显示什么属性。
 *
 *   选「视频片段」→ 基础(trim/速度)/ 音频 / 画面效果 / 调色 / 转场 / 速度高级 / [画中画] / 字幕
 *   选「图片片段」→ 显示(时长 + 不透明度)/ 调色 / 转场 / [画中画] / 字幕(无音频/无速度高级)
 *   选「音频片段」→ 基础(trim + 速度)/ 音量 / 淡入淡出 / 变调(无画面/无转场/无字幕)
 *
 * 视觉上:
 *   - 顶部 type banner 用**不同 accent 色**(视频橙 / 图片紫 / 音频蓝)
 *   - 头部大字写明 clip 类型 + 文件名 + 关键元信息
 *   - 调色 / 转场 / 字幕等纯视觉 section 在音频片段下**完全不渲染**(不是灰掉,而是消失)
 */

const TYPE_COLOR = {
  video: "var(--accent)",       // 橙
  image: "#3ddc97",             // 绿
  audio: "#4ea8f7",             // 蓝
} as const;

type ClipKind = "video" | "image" | "audio";

function clipKind(clip: EditorClip): ClipKind {
  if (clip.mediaType === "image") return "image";
  if (clip.mediaType === "audio") return "audio";
  return "video";
}

export function ClipInspector({
  clip,
  zh,
  onUpdate,
  onMove,
  onRemove,
  isFirst,
  isLast,
}: {
  clip: EditorClip;
  zh: boolean;
  onUpdate: (patch: Partial<EditorClip>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  isFirst: boolean;
  isLast: boolean;
  /** @deprecated 保留接口兼容 */
  editorLevel?: 1 | 2;
}) {
  const kind = clipKind(clip);
  const isPipTrack = kind !== "audio" && !!clip.trackId && clip.trackId !== "v1";
  const typeColor = TYPE_COLOR[kind];

  return (
    <div
      className="insp"
      style={{ ["--type-color" as string]: typeColor }}
    >
      {/* ─── Type Banner —— 让用户一眼看到"我在编辑视频/图片/音频" ─── */}
      <TypeBanner clip={clip} kind={kind} zh={zh} />

      {/* ─── 操作行 ─── */}
      <div className="insp-actions">
        <button type="button" className="insp-act" onClick={() => onMove(-1)} disabled={isFirst} title={zh ? "上移" : "Move up"} aria-label={zh ? "上移" : "Move up"}>
          <IcoArrowUp />
        </button>
        <button type="button" className="insp-act" onClick={() => onMove(1)} disabled={isLast} title={zh ? "下移" : "Move down"} aria-label={zh ? "下移" : "Move down"}>
          <IcoArrowDown />
        </button>
        <div className="insp-act-flex" />
        <button type="button" className="insp-act danger" onClick={onRemove} title={zh ? "删除此片段" : "Remove clip"} aria-label={zh ? "删除" : "Remove"}>
          <IcoTrash />
          <span>{zh ? "删除" : "Remove"}</span>
        </button>
      </div>

      {/* ─── 按 type 分发渲染:视频 / 图片 / 音频 三套不同布局 ─── */}
      {kind === "video" && <VideoSections clip={clip} zh={zh} onUpdate={onUpdate} isPipTrack={isPipTrack} />}
      {kind === "image" && <ImageSections clip={clip} zh={zh} onUpdate={onUpdate} isPipTrack={isPipTrack} />}
      {kind === "audio" && <AudioSections clip={clip} zh={zh} onUpdate={onUpdate} />}

      <style jsx>{`
        .insp {
          padding: 16px 16px 32px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .insp-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .insp-act {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--ink-2);
          border: 1px solid var(--line);
          color: var(--paper-dim);
          padding: 7px 10px;
          border-radius: 7px;
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          transition: all 0.15s ease;
        }
        .insp-act:hover:not(:disabled) {
          background: var(--ink-3);
          color: var(--paper);
          border-color: color-mix(in oklab, var(--paper) 25%, var(--line));
          transform: translateY(-1px);
        }
        .insp-act:active:not(:disabled) { transform: translateY(0); }
        .insp-act:disabled { opacity: 0.35; cursor: not-allowed; }
        .insp-act.danger {
          color: color-mix(in oklab, #ff5a5a 70%, var(--paper-dim));
        }
        .insp-act.danger:hover:not(:disabled) {
          background: color-mix(in oklab, #ff5a5a 12%, var(--ink-3));
          color: #ff5a5a;
          border-color: color-mix(in oklab, #ff5a5a 40%, var(--line));
        }
        .insp-act-flex { flex: 1; }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
 * Type Banner —— 视觉强化"当前在编辑什么类型"
 * ────────────────────────────────────────────────────────── */
function TypeBanner({ clip, kind, zh }: { clip: EditorClip; kind: ClipKind; zh: boolean }) {
  const typeLabel = {
    video: zh ? "视频片段" : "Video Clip",
    image: zh ? "图片片段" : "Image Clip",
    audio: zh ? "音频片段" : "Audio Clip",
  }[kind];
  const typeIcon = {
    video: <IcoFilm />,
    image: <IcoImage />,
    audio: <IcoWave />,
  }[kind];
  const meta =
    kind === "image"
      ? (zh ? `静态图 · 显示 ${clip.out.toFixed(1)}s` : `Still · shows for ${clip.out.toFixed(1)}s`)
      : (zh ? `原长 ${clip.duration.toFixed(1)}s · 当前段 ${((clip.out - clip.in) / clip.speed).toFixed(1)}s` : `Source ${clip.duration.toFixed(1)}s · used ${((clip.out - clip.in) / clip.speed).toFixed(1)}s`);

  return (
    <div className={`tbn tbn-${kind}`}>
      <div className="tbn-icon">{typeIcon}</div>
      <div className="tbn-body">
        <div className="tbn-type">{typeLabel}</div>
        <div className="tbn-name" title={clip.sourceUrl}>{clip.sourceTitle}</div>
        <div className="tbn-meta">{meta}</div>
      </div>
      <style jsx>{`
        .tbn {
          position: relative;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          background:
            linear-gradient(135deg, color-mix(in oklab, var(--type-color) 14%, transparent) 0%, transparent 60%),
            var(--ink-2);
          border: 1px solid color-mix(in oklab, var(--type-color) 30%, var(--line));
          border-radius: 12px;
          overflow: hidden;
        }
        .tbn::before {
          content: "";
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 3px;
          background: var(--type-color);
        }
        .tbn-icon {
          width: 44px; height: 44px;
          border-radius: 10px;
          background: color-mix(in oklab, var(--type-color) 18%, transparent);
          color: var(--type-color);
          display: grid; place-items: center;
          flex-shrink: 0;
        }
        .tbn-body { flex: 1; min-width: 0; }
        .tbn-type {
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--type-color);
          line-height: 1;
          margin-bottom: 5px;
        }
        .tbn-name {
          font-family: var(--font-serif);
          font-size: 15px;
          font-weight: 600;
          color: var(--paper);
          line-height: 1.25;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .tbn-meta {
          font-family: var(--font-mono);
          font-size: 10.5px;
          letter-spacing: 0.06em;
          color: var(--paper-mute);
          margin-top: 3px;
        }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
 * VideoSections —— 视频独享:基础(trim/speed)/ 音频 / 画面效果 / 调色 / 转场 / 速度高级 / [PiP] / 字幕
 * ────────────────────────────────────────────────────────── */
function VideoSections({
  clip, zh, onUpdate, isPipTrack,
}: { clip: EditorClip; zh: boolean; onUpdate: (p: Partial<EditorClip>) => void; isPipTrack: boolean }) {
  const dur = clip.duration;
  const text: EditorTextOverlay = clip.text ?? { content: "", position: "bottom", color: "#ffffff", sizePx: 32 };
  const hasReverse = !!clip.reversed;
  const hasFade = (clip.fadeIn ?? 0) > 0 || (clip.fadeOut ?? 0) > 0;
  const hasOpacity = (clip.opacity ?? 1) < 1;
  const fxActive = hasReverse || hasFade || hasOpacity;
  const hasAdjust = !!clip.adjust && ((clip.adjust.brightness ?? 0) !== 0 || (clip.adjust.contrast ?? 1) !== 1 || (clip.adjust.saturation ?? 1) !== 1);
  const hasFilter = !!clip.filter && clip.filter !== "none";
  const colorActive = hasAdjust || hasFilter;
  const hasTransition = !!clip.transition && clip.transition.type !== "none";
  const hasSpeedCurve = !!clip.speedCurve && clip.speedCurve !== "linear";
  const hasPitch = !!clip.pitchShift && clip.pitchShift !== 0;
  const speedActive = hasSpeedCurve || hasPitch;
  const hasCaption = !!text.content;

  return (
    <>
      <Section title={zh ? "基础" : "Basic"} icon={<IcoBasic />} alwaysOpen>
        <Row label={zh ? "入点 IN" : "Trim IN"}>
          <Slider min={0} max={dur} step={0.1} value={clip.in} onChange={(v) => onUpdate({ in: Math.min(v, clip.out - 0.1) })} format={(v) => `${v.toFixed(1)}s`} />
        </Row>
        <Row label={zh ? "出点 OUT" : "Trim OUT"}>
          <Slider min={0} max={dur} step={0.1} value={clip.out} onChange={(v) => onUpdate({ out: Math.max(v, clip.in + 0.1) })} format={(v) => `${v.toFixed(1)}s`} />
        </Row>
        <div className="insp-foot">
          {zh ? "实际时长" : "Rendered"} <strong>{((clip.out - clip.in) / clip.speed).toFixed(2)}s</strong>
        </div>
        <Row label={zh ? "播放速度" : "Speed"}>
          <Segs options={[["0.25", 0.25], ["0.5", 0.5], ["1", 1], ["1.5", 1.5], ["2", 2]]} value={clip.speed} onChange={(v) => onUpdate({ speed: v as number })} suffix="x" />
        </Row>
      </Section>

      <Section title={zh ? "音频" : "Audio"} icon={<IcoAudio />} alwaysOpen>
        <Row label={zh ? "音量" : "Volume"}>
          <div className="vol-row">
            <Slider min={0} max={1} step={0.05} value={clip.volume} onChange={(v) => onUpdate({ volume: v })} disabled={!!clip.muted} format={(v) => clip.muted ? (zh ? "已静音" : "muted") : `${Math.round(v * 100)}%`} />
            <button type="button" className={`insp-mute${clip.muted ? " on" : ""}`} onClick={() => onUpdate({ muted: !clip.muted })} title={clip.muted ? (zh ? "取消静音" : "Unmute") : (zh ? "静音" : "Mute")}>
              {clip.muted ? <IcoMuted /> : <IcoVolume />}
            </button>
          </div>
        </Row>
        <style jsx>{`
          .vol-row { display: flex; align-items: center; gap: 8px; }
          .insp-mute {
            flex-shrink: 0;
            width: 30px; height: 30px;
            background: var(--ink-2);
            border: 1px solid var(--line);
            color: var(--paper-dim);
            border-radius: 7px;
            display: grid; place-items: center;
            cursor: pointer;
            transition: all 0.15s;
          }
          .insp-mute:hover { color: var(--paper); border-color: var(--paper-mute); }
          .insp-mute.on {
            color: #ff5a5a;
            background: color-mix(in oklab, #ff5a5a 12%, var(--ink-2));
            border-color: color-mix(in oklab, #ff5a5a 40%, var(--line));
          }
        `}</style>
      </Section>

      <Section
        title={zh ? "画面效果" : "Visual FX"}
        icon={<IcoFx />}
        hasContent={fxActive}
        badge={[hasReverse && (zh ? "倒放" : "Rev"), hasFade && (zh ? "淡入出" : "Fade"), hasOpacity && (zh ? "透明" : "Opa")].filter(Boolean).join(" · ") || undefined}
        defaultOpen={fxActive}
      >
        <Row label={zh ? "倒放(视频 + 音频)" : "Reverse (A/V)"}>
          <Toggle on={!!clip.reversed} onChange={(v) => onUpdate({ reversed: v })} labelOn={zh ? "已开启" : "ON"} labelOff={zh ? "关闭" : "OFF"} />
        </Row>
        <Row label={zh ? "淡入" : "Fade In"}>
          <Slider min={0} max={3} step={0.1} value={clip.fadeIn ?? 0} onChange={(v) => onUpdate({ fadeIn: v })} format={(v) => `${v.toFixed(1)}s`} />
        </Row>
        <Row label={zh ? "淡出" : "Fade Out"}>
          <Slider min={0} max={3} step={0.1} value={clip.fadeOut ?? 0} onChange={(v) => onUpdate({ fadeOut: v })} format={(v) => `${v.toFixed(1)}s`} />
        </Row>
        <Row label={zh ? "不透明度" : "Opacity"}>
          <Slider min={0} max={1} step={0.05} value={clip.opacity ?? 1} onChange={(v) => onUpdate({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
        </Row>
      </Section>

      <ColorSection clip={clip} zh={zh} onUpdate={onUpdate} colorActive={colorActive} hasAdjust={hasAdjust} hasFilter={hasFilter} />
      <TransitionSection clip={clip} zh={zh} onUpdate={onUpdate} hasTransition={hasTransition} />

      <Section
        title={zh ? "速度高级" : "Speed Advanced"}
        icon={<IcoSpeedometer />}
        hasContent={speedActive}
        badge={[hasSpeedCurve && clip.speedCurve, hasPitch && `${clip.pitchShift! > 0 ? "+" : ""}${clip.pitchShift}st`].filter(Boolean).join(" · ") || undefined}
        defaultOpen={speedActive}
      >
        <Row label={zh ? "速度曲线" : "Speed Curve"}>
          <Segs wrap options={[["linear", zh ? "匀速" : "Linear"], ["ease-in", zh ? "缓入" : "Ease In"], ["ease-out", zh ? "缓出" : "Ease Out"], ["ease-in-out", zh ? "缓入出" : "Ease I/O"], ["ramp-up", zh ? "加速" : "Ramp↑"], ["ramp-down", zh ? "减速" : "Ramp↓"]]} value={clip.speedCurve ?? "linear"} onChange={(v) => onUpdate({ speedCurve: v === "linear" ? undefined : (v as EditorClip["speedCurve"]) })} />
        </Row>
        <Row label={zh ? "变调(半音)" : "Pitch (semitones)"}>
          <Slider min={-12} max={12} step={1} value={clip.pitchShift ?? 0} onChange={(v) => onUpdate({ pitchShift: v === 0 ? undefined : v })} format={(v) => `${v > 0 ? "+" : ""}${v} st`} hasCenter />
        </Row>
      </Section>

      {isPipTrack && <PipSection clip={clip} zh={zh} onUpdate={onUpdate} />}

      <CaptionSection zh={zh} onUpdate={onUpdate} hasCaption={hasCaption} text={text} />
    </>
  );
}

/* ──────────────────────────────────────────────────────────
 * ImageSections —— 图片独享:显示(duration/opacity)/ 调色 / 转场 / [PiP] / 字幕
 *   (无 trim/speed/音频/反转/淡入淡出/速度高级 —— 静态图不需要)
 * ────────────────────────────────────────────────────────── */
function ImageSections({
  clip, zh, onUpdate, isPipTrack,
}: { clip: EditorClip; zh: boolean; onUpdate: (p: Partial<EditorClip>) => void; isPipTrack: boolean }) {
  const text: EditorTextOverlay = clip.text ?? { content: "", position: "bottom", color: "#ffffff", sizePx: 32 };
  const hasOpacity = (clip.opacity ?? 1) < 1;
  const hasAdjust = !!clip.adjust && ((clip.adjust.brightness ?? 0) !== 0 || (clip.adjust.contrast ?? 1) !== 1 || (clip.adjust.saturation ?? 1) !== 1);
  const hasFilter = !!clip.filter && clip.filter !== "none";
  const colorActive = hasAdjust || hasFilter;
  const hasTransition = !!clip.transition && clip.transition.type !== "none";
  const hasCaption = !!text.content;

  return (
    <>
      <Section title={zh ? "显示" : "Display"} icon={<IcoImage />} alwaysOpen>
        <Row label={zh ? "显示时长" : "Duration"}>
          <Slider min={0.5} max={30} step={0.5} value={clip.out} onChange={(v) => onUpdate({ out: v, duration: v })} format={(v) => `${v.toFixed(1)}s`} />
        </Row>
        <Row label={zh ? "不透明度" : "Opacity"}>
          <Slider min={0} max={1} step={0.05} value={clip.opacity ?? 1} onChange={(v) => onUpdate({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} hasCenter={hasOpacity} centerValue={1} />
        </Row>
      </Section>

      <ColorSection clip={clip} zh={zh} onUpdate={onUpdate} colorActive={colorActive} hasAdjust={hasAdjust} hasFilter={hasFilter} />
      <TransitionSection clip={clip} zh={zh} onUpdate={onUpdate} hasTransition={hasTransition} />
      {isPipTrack && <PipSection clip={clip} zh={zh} onUpdate={onUpdate} />}
      <CaptionSection zh={zh} onUpdate={onUpdate} hasCaption={hasCaption} text={text} />
    </>
  );
}

/* ──────────────────────────────────────────────────────────
 * AudioSections —— 音频独享:基础(trim + speed) / 音量 / 淡入淡出 / 变调
 *   (无任何视觉相关 section)
 * ────────────────────────────────────────────────────────── */
function AudioSections({
  clip, zh, onUpdate,
}: { clip: EditorClip; zh: boolean; onUpdate: (p: Partial<EditorClip>) => void }) {
  const dur = clip.duration;
  const hasFade = (clip.fadeIn ?? 0) > 0 || (clip.fadeOut ?? 0) > 0;
  const hasPitch = !!clip.pitchShift && clip.pitchShift !== 0;
  const hasSpeedCurve = !!clip.speedCurve && clip.speedCurve !== "linear";

  return (
    <>
      <Section title={zh ? "基础" : "Basic"} icon={<IcoBasic />} alwaysOpen>
        <Row label={zh ? "入点 IN" : "Trim IN"}>
          <Slider min={0} max={dur} step={0.1} value={clip.in} onChange={(v) => onUpdate({ in: Math.min(v, clip.out - 0.1) })} format={(v) => `${v.toFixed(1)}s`} />
        </Row>
        <Row label={zh ? "出点 OUT" : "Trim OUT"}>
          <Slider min={0} max={dur} step={0.1} value={clip.out} onChange={(v) => onUpdate({ out: Math.max(v, clip.in + 0.1) })} format={(v) => `${v.toFixed(1)}s`} />
        </Row>
        <div className="insp-foot">
          {zh ? "实际时长" : "Rendered"} <strong>{((clip.out - clip.in) / clip.speed).toFixed(2)}s</strong>
        </div>
        <Row label={zh ? "播放速度" : "Speed"}>
          <Segs options={[["0.25", 0.25], ["0.5", 0.5], ["1", 1], ["1.5", 1.5], ["2", 2]]} value={clip.speed} onChange={(v) => onUpdate({ speed: v as number })} suffix="x" />
        </Row>
      </Section>

      <Section title={zh ? "音量" : "Volume"} icon={<IcoVolume />} alwaysOpen>
        <Row label={zh ? "音量" : "Volume"}>
          <div className="vol-row">
            <Slider min={0} max={1} step={0.05} value={clip.volume} onChange={(v) => onUpdate({ volume: v })} disabled={!!clip.muted} format={(v) => clip.muted ? (zh ? "已静音" : "muted") : `${Math.round(v * 100)}%`} />
            <button type="button" className={`insp-mute${clip.muted ? " on" : ""}`} onClick={() => onUpdate({ muted: !clip.muted })} title={clip.muted ? (zh ? "取消静音" : "Unmute") : (zh ? "静音" : "Mute")}>
              {clip.muted ? <IcoMuted /> : <IcoVolume />}
            </button>
          </div>
        </Row>
        <Row label={zh ? "倒放" : "Reverse"}>
          <Toggle on={!!clip.reversed} onChange={(v) => onUpdate({ reversed: v })} labelOn={zh ? "已开启" : "ON"} labelOff={zh ? "关闭" : "OFF"} />
        </Row>
        <style jsx>{`
          .vol-row { display: flex; align-items: center; gap: 8px; }
          .insp-mute {
            flex-shrink: 0;
            width: 30px; height: 30px;
            background: var(--ink-2);
            border: 1px solid var(--line);
            color: var(--paper-dim);
            border-radius: 7px;
            display: grid; place-items: center;
            cursor: pointer;
            transition: all 0.15s;
          }
          .insp-mute:hover { color: var(--paper); border-color: var(--paper-mute); }
          .insp-mute.on {
            color: #ff5a5a;
            background: color-mix(in oklab, #ff5a5a 12%, var(--ink-2));
            border-color: color-mix(in oklab, #ff5a5a 40%, var(--line));
          }
        `}</style>
      </Section>

      <Section
        title={zh ? "淡入淡出" : "Fade"}
        icon={<IcoFx />}
        hasContent={hasFade}
        badge={hasFade ? `${(clip.fadeIn ?? 0).toFixed(1)}s / ${(clip.fadeOut ?? 0).toFixed(1)}s` : undefined}
        defaultOpen={hasFade}
      >
        <Row label={zh ? "淡入" : "Fade In"}>
          <Slider min={0} max={3} step={0.1} value={clip.fadeIn ?? 0} onChange={(v) => onUpdate({ fadeIn: v })} format={(v) => `${v.toFixed(1)}s`} />
        </Row>
        <Row label={zh ? "淡出" : "Fade Out"}>
          <Slider min={0} max={3} step={0.1} value={clip.fadeOut ?? 0} onChange={(v) => onUpdate({ fadeOut: v })} format={(v) => `${v.toFixed(1)}s`} />
        </Row>
      </Section>

      <Section
        title={zh ? "速度 / 变调" : "Speed / Pitch"}
        icon={<IcoSpeedometer />}
        hasContent={hasPitch || hasSpeedCurve}
        badge={[hasSpeedCurve && clip.speedCurve, hasPitch && `${clip.pitchShift! > 0 ? "+" : ""}${clip.pitchShift}st`].filter(Boolean).join(" · ") || undefined}
        defaultOpen={hasPitch || hasSpeedCurve}
      >
        <Row label={zh ? "速度曲线" : "Speed Curve"}>
          <Segs wrap options={[["linear", zh ? "匀速" : "Linear"], ["ease-in", zh ? "缓入" : "Ease In"], ["ease-out", zh ? "缓出" : "Ease Out"], ["ease-in-out", zh ? "缓入出" : "Ease I/O"], ["ramp-up", zh ? "加速" : "Ramp↑"], ["ramp-down", zh ? "减速" : "Ramp↓"]]} value={clip.speedCurve ?? "linear"} onChange={(v) => onUpdate({ speedCurve: v === "linear" ? undefined : (v as EditorClip["speedCurve"]) })} />
        </Row>
        <Row label={zh ? "变调(半音)" : "Pitch (semitones)"}>
          <Slider min={-12} max={12} step={1} value={clip.pitchShift ?? 0} onChange={(v) => onUpdate({ pitchShift: v === 0 ? undefined : v })} format={(v) => `${v > 0 ? "+" : ""}${v} st`} hasCenter />
        </Row>
      </Section>
    </>
  );
}

/* ──────────────────────────────────────────────────────────
 * 复用 section 组件
 * ────────────────────────────────────────────────────────── */
function ColorSection({ clip, zh, onUpdate, colorActive, hasAdjust, hasFilter }: { clip: EditorClip; zh: boolean; onUpdate: (p: Partial<EditorClip>) => void; colorActive: boolean; hasAdjust: boolean; hasFilter: boolean }) {
  return (
    <Section
      title={zh ? "调色" : "Color"}
      icon={<IcoPalette />}
      hasContent={colorActive}
      badge={[hasAdjust && (zh ? "已调" : "Adj"), hasFilter && clip.filter].filter(Boolean).join(" · ") || undefined}
      defaultOpen={colorActive}
    >
      <Row label={zh ? "亮度" : "Brightness"}>
        <Slider min={-0.5} max={0.5} step={0.02} value={clip.adjust?.brightness ?? 0} onChange={(v) => onUpdate({ adjust: { ...clip.adjust, brightness: v } })} format={(v) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}`} hasCenter />
      </Row>
      <Row label={zh ? "对比度" : "Contrast"}>
        <Slider min={0.4} max={1.8} step={0.05} value={clip.adjust?.contrast ?? 1} onChange={(v) => onUpdate({ adjust: { ...clip.adjust, contrast: v } })} format={(v) => `${Math.round(v * 100)}%`} hasCenter centerValue={1} />
      </Row>
      <Row label={zh ? "饱和度" : "Saturation"}>
        <Slider min={0} max={2} step={0.05} value={clip.adjust?.saturation ?? 1} onChange={(v) => onUpdate({ adjust: { ...clip.adjust, saturation: v } })} format={(v) => `${Math.round(v * 100)}%`} hasCenter centerValue={1} />
      </Row>
      <div className="row-end">
        <button type="button" className="insp-link" onClick={() => onUpdate({ adjust: undefined })} disabled={!clip.adjust} title={zh ? "重置画面调整" : "Reset color adjustments"}>
          <IcoReset /> {zh ? "重置" : "Reset"}
        </button>
      </div>
      <Row label={zh ? "滤镜风格" : "Filter"}>
        <Segs wrap options={[["none", zh ? "无" : "None"], ["warm", zh ? "暖色" : "Warm"], ["cool", zh ? "冷色" : "Cool"], ["cinematic", zh ? "电影" : "Cinema"], ["bw", zh ? "黑白" : "B&W"], ["vintage", zh ? "复古" : "Vintage"], ["vivid", zh ? "鲜艳" : "Vivid"], ["dramatic", zh ? "戏剧" : "Drama"], ["pastel", zh ? "柔和" : "Pastel"]]} value={clip.filter ?? "none"} onChange={(v) => onUpdate({ filter: v === "none" ? undefined : (v as EditorClip["filter"]) })} />
      </Row>
      <style jsx>{`
        .row-end { display: flex; justify-content: flex-end; }
        .insp-link {
          display: inline-flex; align-items: center; gap: 5px;
          background: transparent; border: none;
          color: var(--paper-mute);
          font-family: var(--font-mono);
          font-size: 10.5px; letter-spacing: 0.08em;
          cursor: pointer; padding: 4px 8px;
          border-radius: 5px;
          transition: color 0.15s;
        }
        .insp-link:hover:not(:disabled) { color: var(--accent); }
        .insp-link:disabled { opacity: 0.35; cursor: not-allowed; }
      `}</style>
    </Section>
  );
}

function TransitionSection({ clip, zh, onUpdate, hasTransition }: { clip: EditorClip; zh: boolean; onUpdate: (p: Partial<EditorClip>) => void; hasTransition: boolean }) {
  return (
    <Section
      title={zh ? "转场" : "Transition"}
      icon={<IcoTransition />}
      hasContent={hasTransition}
      badge={hasTransition ? clip.transition!.type : undefined}
      defaultOpen={hasTransition}
    >
      <Row label={zh ? "出场类型(本段→下段)" : "Out Type (this → next)"}>
        <Segs wrap options={[["none", zh ? "无" : "None"], ["fade", zh ? "淡化" : "Fade"], ["fadeblack", zh ? "黑场" : "Black"], ["fadewhite", zh ? "白场" : "White"], ["wipeleft", zh ? "左擦" : "Wipe←"], ["wiperight", zh ? "右擦" : "Wipe→"], ["slideleft", zh ? "左滑" : "Slide←"], ["slideright", zh ? "右滑" : "Slide→"], ["circleopen", zh ? "圆开" : "Circle○"], ["dissolve", zh ? "溶解" : "Dissolve"]]} value={clip.transition?.type ?? "none"} onChange={(v) => onUpdate({ transition: v === "none" ? undefined : { type: v as NonNullable<EditorClip["transition"]>["type"], duration: clip.transition?.duration ?? 0.5 } })} />
      </Row>
      {clip.transition && (
        <Row label={zh ? "时长" : "Duration"}>
          <Slider min={0.1} max={2} step={0.1} value={clip.transition.duration} onChange={(v) => onUpdate({ transition: { ...clip.transition!, duration: v } })} format={(v) => `${v.toFixed(1)}s`} />
        </Row>
      )}
      {/* 转场预览限制 hint —— 浏览器播放无法实时合成 xfade,只能等导出 */}
      <div className="trans-hint">
        <span className="trans-hint-ico">ⓘ</span>
        <span>
          {zh
            ? "转场在「导出 MP4」时由 FFmpeg 合成,浏览器实时预览看不到。本段需要后面有相邻片段才生效。"
            : "Transitions render at export time (FFmpeg) — not visible in live preview. Requires a following clip on the same track."}
        </span>
      </div>
      <style jsx>{`
        .trans-hint {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          padding: 8px 10px;
          background: color-mix(in oklab, var(--type-color, var(--accent)) 8%, transparent);
          border: 1px solid color-mix(in oklab, var(--type-color, var(--accent)) 25%, var(--line));
          border-radius: 6px;
          font-family: var(--font-sans);
          font-size: 11px;
          line-height: 1.45;
          color: var(--paper-dim);
        }
        .trans-hint-ico {
          flex-shrink: 0;
          color: var(--type-color, var(--accent));
          font-weight: 700;
          font-family: var(--font-serif);
        }
      `}</style>
    </Section>
  );
}

function PipSection({ clip, zh, onUpdate }: { clip: EditorClip; zh: boolean; onUpdate: (p: Partial<EditorClip>) => void }) {
  return (
    <Section title={zh ? "画中画" : "Picture-in-Picture"} icon={<IcoPip />} defaultOpen>
      <Row label={zh ? "快速位置" : "Quick Position"}>
        <div className="pip-grid">
          {(
            [
              [0.25, 0.25, "TL"], [0.5, 0.25, "TC"], [0.75, 0.25, "TR"],
              [0.25, 0.5, "L"], [0.5, 0.5, "C"], [0.75, 0.5, "R"],
              [0.25, 0.75, "BL"], [0.5, 0.75, "BC"], [0.75, 0.75, "BR"],
            ] as const
          ).map(([px, py, key]) => {
            const on = (clip.pip?.x ?? 0.5) === px && (clip.pip?.y ?? 0.5) === py;
            return (
              <button key={key} type="button" className={`pip-cell${on ? " on" : ""}`} onClick={() => onUpdate({ pip: { x: px, y: py, scale: clip.pip?.scale ?? 0.3 } })} aria-label={key} />
            );
          })}
        </div>
      </Row>
      <Row label={zh ? "缩放" : "Scale"}>
        <Slider min={0.1} max={1} step={0.05} value={clip.pip?.scale ?? 0.3} onChange={(v) => onUpdate({ pip: { x: clip.pip?.x ?? 0.5, y: clip.pip?.y ?? 0.5, scale: v } })} format={(v) => `${Math.round(v * 100)}%`} />
      </Row>
      <div className="pip-foot">
        {zh ? "也可在预览画面里直接拖拽 · 滚轮缩放 · 双击复位" : "Drag in preview · wheel to scale · double-click to reset"}
      </div>
      <style jsx>{`
        .pip-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 4px;
          aspect-ratio: 16 / 9;
          background: var(--ink-2);
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 5px;
        }
        .pip-cell {
          background: color-mix(in oklab, var(--paper) 8%, transparent);
          border: 1px solid transparent;
          border-radius: 3px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .pip-cell:hover { background: color-mix(in oklab, var(--type-color, var(--accent)) 18%, transparent); }
        .pip-cell.on {
          background: var(--type-color, var(--accent));
          box-shadow: 0 0 0 1px color-mix(in oklab, var(--type-color, var(--accent)) 60%, transparent);
        }
        .pip-foot {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--paper-dim);
          letter-spacing: 0.04em;
        }
      `}</style>
    </Section>
  );
}

function CaptionSection({ zh, onUpdate, hasCaption, text }: { zh: boolean; onUpdate: (p: Partial<EditorClip>) => void; hasCaption: boolean; text: EditorTextOverlay }) {
  return (
    <Section
      title={zh ? "字幕" : "Caption"}
      icon={<IcoCaption />}
      hasContent={hasCaption}
      badge={hasCaption ? `"${text.content.slice(0, 12)}${text.content.length > 12 ? "…" : ""}"` : undefined}
      defaultOpen={hasCaption}
    >
      <Row label={zh ? "文字" : "Text"}>
        <input className="cap-input" placeholder={zh ? "留空则不叠加" : "Leave empty for none"} value={text.content} onChange={(e) => onUpdate({ text: { ...text, content: e.target.value } })} />
      </Row>
      <Row label={zh ? "位置" : "Position"}>
        <Segs options={[["top", zh ? "顶部" : "Top"], ["center", zh ? "居中" : "Center"], ["bottom", zh ? "底部" : "Bottom"]]} value={text.position} onChange={(v) => onUpdate({ text: { ...text, position: v as EditorTextOverlay["position"] } })} />
      </Row>
      <div className="cap-row-2">
        <Row label={zh ? "颜色" : "Color"}>
          <input type="color" value={text.color} onChange={(e) => onUpdate({ text: { ...text, color: e.target.value } })} className="cap-color" aria-label={zh ? "字幕颜色" : "Caption color"} />
        </Row>
        <Row label={zh ? "字号" : "Size"}>
          <input type="number" min={12} max={120} value={text.sizePx} onChange={(e) => onUpdate({ text: { ...text, sizePx: Math.max(12, Math.min(120, Number(e.target.value))) } })} className="cap-input" />
        </Row>
      </div>
      <div className="cap-actions">
        <button type="button" className="cap-clear" disabled={!hasCaption && !text.content.trim()} onClick={() => onUpdate({ text: undefined })}>
          {zh ? "清除字幕" : "Clear caption"}
        </button>
      </div>
      <style jsx>{`
        .cap-input {
          width: 100%;
          background: var(--ink-2);
          border: 1px solid var(--line);
          color: var(--paper);
          padding: 8px 10px;
          border-radius: 6px;
          font-family: var(--font-sans);
          font-size: 12.5px;
          outline: none;
          transition: border-color 0.15s;
        }
        .cap-input:focus {
          border-color: color-mix(in oklab, var(--type-color, var(--accent)) 60%, var(--line));
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--type-color, var(--accent)) 12%, transparent);
        }
        .cap-color {
          width: 100%;
          height: 38px;
          background: var(--ink-2);
          border: 1px solid var(--line);
          border-radius: 6px;
          cursor: pointer;
          padding: 3px;
        }
        .cap-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .cap-actions {
          display: flex;
          justify-content: flex-end;
        }
        .cap-clear {
          border: 1px solid var(--line);
          background: color-mix(in oklab, var(--ink-2) 86%, transparent);
          color: var(--paper);
          border-radius: 6px;
          padding: 7px 10px;
          font-size: 12px;
          cursor: pointer;
        }
        .cap-clear:hover:not(:disabled) {
          border-color: color-mix(in oklab, var(--type-color, var(--accent)) 55%, var(--line));
          color: var(--type-color, var(--accent));
        }
        .cap-clear:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
      `}</style>
    </Section>
  );
}

/* ──────────────────────────────────────────────────────────
 * Section / Row / Slider / Segs / Toggle 共用控件
 * ────────────────────────────────────────────────────────── */
function Section({
  title, icon, badge, defaultOpen = false, alwaysOpen = false, hasContent = false, children,
}: {
  title: string; icon: ReactNode; badge?: string;
  defaultOpen?: boolean; alwaysOpen?: boolean; hasContent?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen || alwaysOpen);
  return (
    <div className={`isec${open ? " open" : ""}${hasContent ? " active" : ""}${alwaysOpen ? " locked" : ""}`}>
      <button type="button" className="isec-h" onClick={alwaysOpen ? undefined : () => setOpen((v) => !v)} aria-expanded={open} disabled={alwaysOpen}>
        <span className="isec-icon">{icon}</span>
        <span className="isec-title">{title}</span>
        {hasContent && <span className="isec-dot" aria-hidden />}
        {badge && <span className="isec-badge">{badge}</span>}
        {!alwaysOpen && (
          <span className="isec-caret" aria-hidden>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${open ? 90 : 0}deg)`, transition: "transform 0.18s ease" }}>
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </span>
        )}
      </button>
      <div className="isec-body">{open && children}</div>
      <style jsx>{`
        .isec {
          position: relative;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: var(--ink-1);
          overflow: hidden;
          transition: border-color 0.2s ease;
        }
        .isec.active {
          border-color: color-mix(in oklab, var(--type-color, var(--accent)) 35%, var(--line));
        }
        .isec.active::before {
          content: "";
          position: absolute;
          left: 0; top: 12px; bottom: 12px;
          width: 2px;
          background: var(--type-color, var(--accent));
          border-radius: 0 2px 2px 0;
        }
        .isec:hover:not(.locked) {
          border-color: color-mix(in oklab, var(--paper) 25%, var(--line));
        }
        .isec.locked { cursor: default; }
        .isec-h {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 14px;
          background: transparent;
          border: none;
          color: var(--paper);
          cursor: pointer;
          text-align: left;
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          transition: background 0.15s;
        }
        .isec-h:hover:not(:disabled) {
          background: color-mix(in oklab, var(--paper) 4%, transparent);
        }
        .isec-h:disabled { cursor: default; }
        .isec-icon { color: var(--paper-dim); display: inline-flex; }
        .isec.active .isec-icon { color: var(--type-color, var(--accent)); }
        .isec-title { flex: 1; }
        .isec-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--type-color, var(--accent));
          box-shadow: 0 0 8px color-mix(in oklab, var(--type-color, var(--accent)) 60%, transparent);
        }
        .isec-badge {
          font-family: var(--font-serif);
          font-style: italic;
          font-weight: 400;
          font-size: 11.5px;
          letter-spacing: 0;
          text-transform: none;
          color: var(--type-color, var(--accent));
          max-width: 140px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .isec-caret { color: var(--paper-mute); display: inline-flex; }
        .isec-body {
          padding: 0 14px 14px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .isec-body:empty { padding: 0; }
        .isec.open .isec-body { border-top: 1px solid var(--line); padding-top: 12px; }
      `}</style>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="irow">
      <div className="irow-label">{label}</div>
      {children}
      <style jsx>{`
        .irow { display: flex; flex-direction: column; gap: 7px; }
        .irow-label {
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--paper-mute);
        }
      `}</style>
    </div>
  );
}

function Slider({
  min, max, step, value, onChange, format, disabled, hasCenter = false, centerValue,
}: {
  min: number; max: number; step: number; value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
  hasCenter?: boolean;
  centerValue?: number;
}) {
  const center = centerValue ?? (hasCenter ? (min + max) / 2 : undefined);
  return (
    <div className="islide">
      <div className="islide-track">
        {center !== undefined && (
          <div className="islide-center" style={{ left: `${((center - min) / (max - min)) * 100}%` }} />
        )}
        <input
          type="range"
          min={min} max={max} step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
      {format && <span className="islide-val">{format(value)}</span>}
      <style jsx>{`
        .islide { display: flex; align-items: center; gap: 12px; }
        .islide-track {
          position: relative; flex: 1;
          height: 24px;
          display: flex; align-items: center;
        }
        .islide-center {
          position: absolute; top: 50%;
          width: 1px; height: 8px;
          background: var(--paper-mute);
          transform: translate(-50%, -50%);
          pointer-events: none;
        }
        .islide-track input[type="range"] {
          width: 100%;
          accent-color: var(--type-color, var(--accent));
          cursor: pointer;
        }
        .islide-track input[type="range"]:disabled { opacity: 0.4; cursor: not-allowed; }
        .islide-val {
          font-family: var(--font-mono);
          font-size: 11.5px;
          font-weight: 600;
          color: var(--type-color, var(--accent));
          min-width: 56px;
          text-align: right;
        }
      `}</style>
    </div>
  );
}

function Segs<T extends string | number>({
  options, value, onChange, wrap = false, suffix,
}: {
  options: ReadonlyArray<readonly [string, T]>;
  value: T;
  onChange: (v: T) => void;
  wrap?: boolean;
  suffix?: string;
}) {
  return (
    <div className={`isegs${wrap ? " wrap" : ""}`}>
      {options.map(([label, val]) => (
        <button key={String(val)} type="button" className={`iseg${value === val ? " on" : ""}`} onClick={() => onChange(val)}>
          {label}{suffix && (typeof val === "number" || (typeof val === "string" && /^[0-9.]+$/.test(val))) ? suffix : ""}
        </button>
      ))}
      <style jsx>{`
        .isegs { display: flex; gap: 3px; }
        .isegs.wrap { flex-wrap: wrap; }
        .iseg {
          flex: 1; min-width: fit-content;
          background: var(--ink-2);
          border: 1px solid transparent;
          color: var(--paper-dim);
          padding: 7px 9px;
          font-family: var(--font-mono);
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.15s ease;
        }
        .iseg:hover { color: var(--paper); background: var(--ink-3); }
        .iseg.on {
          background: var(--paper); color: var(--ink);
          border-color: var(--paper);
        }
        .iseg:active { transform: scale(0.97); }
      `}</style>
    </div>
  );
}

function Toggle({
  on, onChange, labelOn, labelOff,
}: {
  on: boolean; onChange: (v: boolean) => void;
  labelOn: string; labelOff: string;
}) {
  return (
    <button type="button" className={`itoggle${on ? " on" : ""}`} onClick={() => onChange(!on)} aria-pressed={on}>
      <span className="itoggle-track"><span className="itoggle-thumb" /></span>
      <span className="itoggle-label">{on ? labelOn : labelOff}</span>
      <style jsx>{`
        .itoggle {
          display: inline-flex; align-items: center;
          gap: 10px;
          background: transparent; border: none;
          padding: 4px 0;
          cursor: pointer;
        }
        .itoggle-track {
          width: 36px; height: 20px;
          background: var(--ink-3);
          border-radius: 10px;
          position: relative;
          transition: background 0.18s;
        }
        .itoggle-thumb {
          position: absolute; top: 2px; left: 2px;
          width: 16px; height: 16px;
          background: var(--paper-mute);
          border-radius: 50%;
          transition: transform 0.18s ease, background 0.18s ease;
        }
        .itoggle.on .itoggle-track { background: color-mix(in oklab, var(--type-color, var(--accent)) 35%, var(--ink-3)); }
        .itoggle.on .itoggle-thumb {
          transform: translateX(16px);
          background: var(--type-color, var(--accent));
          box-shadow: 0 0 8px color-mix(in oklab, var(--type-color, var(--accent)) 50%, transparent);
        }
        .itoggle-label {
          font-family: var(--font-mono);
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--paper-dim);
        }
        .itoggle.on .itoggle-label { color: var(--type-color, var(--accent)); }
      `}</style>
    </button>
  );
}

/* ──────────────────────────────────────────────────────────
 * 全局通用样式(.insp-foot 等)用 :global() 跨 styled-jsx
 * ────────────────────────────────────────────────────────── */
function _SharedStyles() {
  return (
    <style jsx global>{`
      .insp .insp-foot {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--paper-dim);
        letter-spacing: 0.04em;
      }
      .insp .insp-foot strong {
        font-family: var(--font-serif);
        font-style: italic;
        font-weight: 400;
        font-size: 14px;
        color: var(--type-color, var(--accent));
      }
    `}</style>
  );
}
// 让 styles 注入 — 在文件末尾导出一次性
export const _InspectorGlobalStyles = _SharedStyles;

/* ──────────────────────────────────────────────────────────
 * SVG Icons
 * ────────────────────────────────────────────────────────── */
const iconBase: SVGProps<SVGSVGElement> = {
  width: 14, height: 14, viewBox: "0 0 24 24",
  fill: "none", stroke: "currentColor",
  strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round",
};
const IcoFilm = () => (<svg {...iconBase} width={18} height={18}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="8" x2="21" y2="8" /><line x1="3" y1="16" x2="21" y2="16" /><line x1="8" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="16" y2="21" /></svg>);
const IcoImage = () => (<svg {...iconBase} width={18} height={18}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="1.5" /><path d="M3 17 L9 12 L13 16 L17 12 L21 16 L21 19 L3 19 Z" /></svg>);
const IcoWave = () => (<svg {...iconBase} width={18} height={18}><path d="M3 12 L5 12 L7 7 L9 17 L11 9 L13 15 L15 11 L17 13 L19 12 L21 12" /></svg>);
const IcoBasic = () => (<svg {...iconBase}><rect x="3" y="6" width="18" height="12" rx="1.5" /><line x1="7" y1="6" x2="7" y2="18" /><line x1="11" y1="6" x2="11" y2="18" /><line x1="15" y1="6" x2="15" y2="18" /><line x1="19" y1="6" x2="19" y2="18" /></svg>);
const IcoAudio = () => (<svg {...iconBase}><line x1="4" y1="10" x2="4" y2="14" /><line x1="8" y1="6" x2="8" y2="18" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="16" y1="4" x2="16" y2="20" /><line x1="20" y1="10" x2="20" y2="14" /></svg>);
const IcoFx = () => (<svg {...iconBase}><path d="M12 3 L13.5 8.5 L19 10 L13.5 11.5 L12 17 L10.5 11.5 L5 10 L10.5 8.5 Z" /><circle cx="19" cy="4" r="0.8" fill="currentColor" /><circle cx="5" cy="19" r="0.8" fill="currentColor" /></svg>);
const IcoPalette = () => (<svg {...iconBase}><path d="M12 3 C7 3 3 7 3 12 C3 17 7 21 12 21 C13.5 21 14 19.5 13.5 18.5 C13 17.5 13.5 16 14.5 16 L16 16 C19 16 21 14 21 11 C21 6.5 17 3 12 3 Z" /><circle cx="7" cy="11" r="1" fill="currentColor" /><circle cx="11" cy="7" r="1" fill="currentColor" /><circle cx="15" cy="9" r="1" fill="currentColor" /></svg>);
const IcoTransition = () => (<svg {...iconBase}><polyline points="5 8 8 8 8 5 13 9 8 13 8 10 5 10" /><polyline points="19 16 16 16 16 13 11 17 16 21 16 18 19 18" transform="translate(0 -3)" /></svg>);
const IcoSpeedometer = () => (<svg {...iconBase}><path d="M4 16 C4 10 8 6 12 6 C16 6 20 10 20 16" /><line x1="12" y1="16" x2="16" y2="11" /><circle cx="12" cy="16" r="1.2" fill="currentColor" /><line x1="4" y1="20" x2="20" y2="20" /></svg>);
const IcoPip = () => (<svg {...iconBase}><rect x="3" y="5" width="18" height="14" rx="1.5" /><rect x="13" y="9" width="6" height="6" rx="0.8" fill="currentColor" fillOpacity="0.18" /></svg>);
const IcoCaption = () => (<svg {...iconBase}><rect x="3" y="6" width="18" height="12" rx="1.5" /><line x1="7" y1="11" x2="17" y2="11" /><line x1="7" y1="14" x2="13" y2="14" /></svg>);
const IcoArrowUp = () => (<svg {...iconBase}><polyline points="6 14 12 8 18 14" /></svg>);
const IcoArrowDown = () => (<svg {...iconBase}><polyline points="6 10 12 16 18 10" /></svg>);
const IcoTrash = () => (<svg {...iconBase}><polyline points="3 6 5 6 21 6" /><path d="M19 6 L18 20 C18 21 17 22 16 22 L8 22 C7 22 6 21 6 20 L5 6" /><path d="M10 11 L10 17 M14 11 L14 17" /><path d="M9 6 L9 4 C9 3 10 2 11 2 L13 2 C14 2 15 3 15 4 L15 6" /></svg>);
const IcoReset = () => (<svg {...iconBase} width={12} height={12}><polyline points="1 4 1 10 7 10" /><path d="M3.5 15 A9 9 0 1 0 6 5.3 L1 10" /></svg>);
const IcoVolume = () => (<svg {...iconBase}><polygon points="4 9 8 9 13 5 13 19 8 15 4 15" fill="currentColor" fillOpacity="0.25" /><path d="M16 8 C18 9.5 18 14.5 16 16" /><path d="M19 5 C22 8 22 16 19 19" /></svg>);
const IcoMuted = () => (<svg {...iconBase}><polygon points="4 9 8 9 13 5 13 19 8 15 4 15" fill="currentColor" fillOpacity="0.25" /><line x1="17" y1="9" x2="22" y2="14" /><line x1="22" y1="9" x2="17" y2="14" /></svg>);
