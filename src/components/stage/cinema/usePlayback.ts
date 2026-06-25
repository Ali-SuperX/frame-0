/**
 * usePlayback —— 镜头导航 + 全屏放映状态机。
 * 与数据/视图解耦，未来加循环 / 倍速 / 自动配音播放只扩展这里。
 */
import { useEffect, useState } from "react";
import { TIMING } from "./config";

export type Playback = ReturnType<typeof usePlayback>;

export function usePlayback(durations: number[]) {
  const count = durations.length;
  const [cur, setCur] = useState(0);
  const [theater, setTheater] = useState(false);
  const [paused, setPaused] = useState(false);
  const safeCur = count > 0 ? Math.min(cur, count - 1) : 0;

  const go = (i: number) => setCur(Math.max(0, Math.min(i, count - 1)));
  const next = () => setCur((c) => Math.min(c + 1, count - 1));
  const prev = () => setCur((c) => Math.max(c - 1, 0));
  const enterTheater = () => { setCur(0); setPaused(false); setTheater(true); };
  const exitTheater = () => { setTheater(false); setPaused(false); };
  const togglePause = () => setPaused((p) => !p);

  // 放映自动推进（仅影院模式）
  useEffect(() => {
    if (!theater || paused || count === 0) return;
    const ms = Math.max(durations[safeCur] ?? 2, TIMING.minShot) * 1000;
    const t = setTimeout(() => {
      setCur((c) => {
        if (c < count - 1) return c + 1;
        setTheater(false);
        return c;
      });
    }, ms);
    return () => clearTimeout(t);
  }, [theater, paused, safeCur, count, durations]);

  // 键盘：← → 切换，空格放映/暂停，ESC 退出。输入聚焦时不抢键。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "Escape") exitTheater();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") {
        e.preventDefault();
        if (theater) togglePause();
        else enterTheater();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theater, count]);

  return { cur: safeCur, theater, paused, setPaused, go, next, prev, enterTheater, exitTheater, togglePause };
}
