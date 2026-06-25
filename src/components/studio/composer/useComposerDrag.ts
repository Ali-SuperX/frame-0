import { useRef, useState, type DragEvent } from "react";

/**
 * 拖图进 composer 的交互 hook —— 只管「拖拽视觉状态 + 事件」，
 * 真正落地动作（切 i2v / 上传）由 onImageDrop 回调实现。
 *
 * 关键点：
 *  - onDragOver 必须 preventDefault，否则浏览器默认打开图片、onDrop 不触发。
 *  - 用 depth 计数抵消子元素冒泡导致的 enter/leave 抖动。
 *  - 仅当拖入物里有 image/* 文件时才点亮 dragActive。
 *  - ignoreSelector：drop 落在内部自带上传区（如 MediaPicker 的 .mmt/.mp）时，
 *    交给那个组件处理，dock 不重复上传。
 */
export function useComposerDrag({
  onImageDrop,
  ignoreSelector,
}: {
  onImageDrop: (files: File[]) => void;
  ignoreSelector?: string;
}) {
  const depth = useRef(0);
  const [dragActive, setDragActive] = useState(false);

  function hasImage(e: DragEvent): boolean {
    const items = e.dataTransfer?.items;
    if (!items) return false;
    return Array.from(items).some(
      (it) => it.kind === "file" && it.type.startsWith("image/")
    );
  }

  function onDragEnter(e: DragEvent) {
    depth.current += 1;
    if (hasImage(e)) setDragActive(true);
  }
  function onDragOver(e: DragEvent) {
    // 必须阻止默认，否则 drop 不会触发
    if (hasImage(e)) e.preventDefault();
  }
  function onDragLeave() {
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragActive(false);
  }
  function onDrop(e: DragEvent) {
    depth.current = 0;
    setDragActive(false);
    // 落在内部自带上传区 → 让它自己处理，避免重复上传
    if (
      ignoreSelector &&
      (e.target as HTMLElement | null)?.closest(ignoreSelector)
    ) {
      return;
    }
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
      f.type.startsWith("image/")
    );
    if (!files.length) return;
    e.preventDefault();
    onImageDrop(files);
  }

  return {
    dragActive,
    dragHandlers: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
