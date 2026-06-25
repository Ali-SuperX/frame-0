/**
 * LumenX Toast 通知 —— 极简全局 Toast，基于 zustand。
 *
 * 用法：
 *   import { useToastStore, showToast } from "@/lib/lumenx/toast";
 *   showToast("操作成功", "success");
 *
 * Layout.tsx 中渲染 Toast 组件读取 useToastStore.toast 即可。
 */

import { create } from "zustand";

export type ToastType = "success" | "error" | "info";

export type ToastState = {
  toast: { message: string; type: ToastType; id: number } | null;
  showToast: (message: string, type?: ToastType) => void;
  clearToast: () => void;
};

let _counter = 0;
let _timer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  toast: null,
  showToast: (message, type = "info") => {
    if (_timer) clearTimeout(_timer);
    const id = ++_counter;
    set({ toast: { message, type, id } });
    _timer = setTimeout(() => {
      set((s) => (s.toast?.id === id ? { toast: null } : s));
    }, 3000);
  },
  clearToast: () => {
    if (_timer) clearTimeout(_timer);
    set({ toast: null });
  },
}));

/** 便捷函数：任意位置调用即可弹 Toast。 */
export function showToast(message: string, type: ToastType = "info") {
  useToastStore.getState().showToast(message, type);
}
