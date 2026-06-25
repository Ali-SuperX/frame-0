/**
 * Cinema 共用小件 —— 画面层 / 场记板 / 字幕内容。
 * 银幕态与影院态共用，保证细节一致；画面渲染集中在 MediaLayer（扩展媒体类型只改这里）。
 */
import { mediaBackground } from "./config";
import type { CineShot } from "./types";

/** 画面层：真实图 / 视频海报 / storyboard 切片 / 待出图占位，统一渲染。
 *  playing → Ken Burns 缓推；fade → 切镜淡入。 */
export function MediaLayer({ shot, playing, fade }: { shot: CineShot; playing?: boolean; fade?: boolean }) {
  const { style, pending } = mediaBackground(shot.media);
  return (
    <>
      <div className={`cn-frame-img${playing ? " is-playing" : ""}${fade ? " is-fade" : ""}`} style={style} />
      {pending && (
        <div className="cn-pending">
          <span className="cn-pending-tag">待出图</span>
          {shot.media.kind === "pending" && shot.media.prompt && <p className="cn-pending-prompt">{shot.media.prompt}</p>}
        </div>
      )}
    </>
  );
}

/** 场记板 —— 景别/运镜/时长（镜号由序号水印承担，不重复）*/
export function Slate({ shot }: { shot: CineShot }) {
  return (
    <div className="cn-slate">
      {shot.size && (<>{shot.size}<span className="cn-sep">/</span></>)}
      <span className="cn-slate-move">{shot.move}</span>
      <span className="cn-sep">/</span>
      {shot.durSec.toFixed(1)}s
    </div>
  );
}

/** 字幕内容（speaker + 台词/旁白）—— 外层样式由调用方决定 */
export function SubtitleContent({ shot }: { shot: CineShot }) {
  if (!shot.line) return <span className="cn-sub-muted">（无台词）</span>;
  return (
    <>
      {shot.speaker && (
        <span className="cn-spk" style={{ ["--cn-spk" as string]: shot.speakerColor ?? "var(--accent)" }}>
          {shot.speaker}
        </span>
      )}
      {shot.speaker ? `「${shot.line}」` : shot.line}
    </>
  );
}
