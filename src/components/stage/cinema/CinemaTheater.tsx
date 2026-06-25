/** 全屏放映 · 影院模式 —— 工具全退场，纯画面 + 字幕，自动推进 + Ken Burns + 转场 */
import { MediaLayer, SubtitleContent } from "./parts";
import type { CineShot } from "./types";

export function CinemaTheater({
  shots,
  cur,
  paused,
  onExit,
  onSelect,
}: {
  shots: CineShot[];
  cur: number;
  paused: boolean;
  onExit: () => void;
  onSelect: (i: number) => void;
}) {
  const shot = shots[cur];
  if (!shot) return null;

  return (
    <div className="cn-theater" onClick={onExit}>
      <div key={shot.id} className="cn-theater-frame">
        <MediaLayer shot={shot} playing={!paused} fade />
      </div>

      {shot.line && (
        <div key={`sub-${shot.id}`} className="cn-theater-sub">
          <SubtitleContent shot={shot} />
        </div>
      )}

      <div className="cn-theater-bar" onClick={(e) => e.stopPropagation()}>
        {shots.map((s, i) => (
          <button
            key={s.id}
            className={`cn-theater-pip${i === cur ? " on" : ""}`}
            onClick={() => onSelect(i)}
            aria-label={`第 ${s.idx} 镜`}
          />
        ))}
      </div>

      <div className="cn-theater-hint">{paused ? "▌▌ 已暂停 · " : ""}空格 暂停 · ← → 切换 · ESC 退出</div>
    </div>
  );
}
