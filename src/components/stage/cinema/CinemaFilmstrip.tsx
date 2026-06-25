"use client";

/** 底部胶片条 —— 故事板序列。当前镜头自动滚入视野（镜头多时也不丢失定位）。 */
import { useEffect, useRef } from "react";
import { mediaBackground, pad2 } from "./config";
import { PlusIcon } from "./icons";
import type { CineShot } from "./types";

export function CinemaFilmstrip({
  shots,
  cur,
  onSelect,
  onAdd,
}: {
  shots: CineShot[];
  cur: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector(".cn-cell.is-current") as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [cur]);

  return (
    <footer className="cn-filmstrip" ref={ref}>
      <span className="cn-strip-label">故事板</span>
      {shots.map((s, i) => {
        const { style, pending } = mediaBackground(s.media);
        return (
          <button
            key={s.id}
            className={`cn-cell${i === cur ? " is-current" : ""}${pending ? " is-blank" : ""}`}
            style={style}
            onClick={() => onSelect(i)}
            title={`SHOT ${s.idx} · ${s.move}`}
          >
            <span className="cn-cell-idx">{pad2(s.idx)}</span>
            <span className="cn-cell-dur">{s.durSec.toFixed(1)}s</span>
          </button>
        );
      })}
      <button className="cn-cell-add" onClick={onAdd}>
        <PlusIcon />
        续写一镜
      </button>
    </footer>
  );
}
