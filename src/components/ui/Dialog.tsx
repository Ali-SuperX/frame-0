"use client";

/**
 * 应用内弹窗 —— 替代原生 alert() / confirm()，与产品 UI 统一。
 *   toast(msg)          轻提示，3 秒自动消失（替代 alert）
 *   confirmDialog(opts) 确认框，返回 Promise<boolean>（替代 confirm）
 * <DialogHost/> 挂在根布局，命令式 API 可在任意位置调用。
 */

import { useEffect } from "react";
import { create } from "zustand";
import { useLocale } from "next-intl";

/* ─────────── store ─────────── */

type ConfirmReq = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
};
type ToastItem = { id: number; message: string; kind: "info" | "error" };

type DialogState = {
  confirm: ConfirmReq | null;
  toasts: ToastItem[];
  _openConfirm: (req: ConfirmReq) => void;
  _closeConfirm: (ok: boolean) => void;
  _addToast: (message: string, kind: "info" | "error") => void;
  _removeToast: (id: number) => void;
};

const useDialogStore = create<DialogState>((set, get) => ({
  confirm: null,
  toasts: [],
  _openConfirm: (req) => set({ confirm: req }),
  _closeConfirm: (ok) => {
    const c = get().confirm;
    set({ confirm: null });
    c?.resolve(ok);
  },
  _addToast: (message, kind) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    window.setTimeout(() => get()._removeToast(id), 3200);
  },
  _removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/* ─────────── 命令式 API ─────────── */

/** 应用内确认框，替代原生 confirm()。返回 Promise<boolean>。 */
export function confirmDialog(opts: {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogStore.getState()._openConfirm({
      title: opts.title,
      message: opts.message,
      confirmText: opts.confirmText,
      cancelText: opts.cancelText,
      danger: opts.danger ?? false,
      resolve,
    });
  });
}

/** 应用内轻提示，替代原生 alert()。 */
export function toast(message: string, kind: "info" | "error" = "info") {
  useDialogStore.getState()._addToast(message, kind);
}

/* ─────────── 渲染宿主，挂在根布局 ─────────── */

export function DialogHost() {
  const locale = useLocale();
  const zh = locale !== "en";
  const confirm = useDialogStore((s) => s.confirm);
  const toasts = useDialogStore((s) => s.toasts);
  const close = useDialogStore((s) => s._closeConfirm);
  const removeToast = useDialogStore((s) => s._removeToast);

  useEffect(() => {
    if (!confirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      else if (e.key === "Enter") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm, close]);

  return (
    <>
      {confirm && (
        <div className="dlg-overlay" onClick={() => close(false)}>
          <div
            className="dlg-card"
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="dlg-title">{confirm.title}</h2>
            {confirm.message && <p className="dlg-msg">{confirm.message}</p>}
            <div className="dlg-actions">
              <button
                type="button"
                className="dlg-btn dlg-btn-ghost"
                onClick={() => close(false)}
                autoFocus
              >
                {confirm.cancelText ?? (zh ? "取消" : "Cancel")}
              </button>
              <button
                type="button"
                className={`dlg-btn ${
                  confirm.danger ? "dlg-btn-danger" : "dlg-btn-accent"
                }`}
                onClick={() => close(true)}
              >
                {confirm.confirmText ?? (zh ? "确认" : "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
      {toasts.length > 0 && (
        <div className="dlg-toasts">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`dlg-toast ${
                t.kind === "error" ? "dlg-toast-err" : ""
              }`}
              onClick={() => removeToast(t.id)}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
      <style jsx>{`
        .dlg-overlay {
          position: fixed;
          inset: 0;
          z-index: 2147483000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(2px);
          animation: dlg-fade 0.12s ease;
        }
        .dlg-card {
          width: 100%;
          max-width: 400px;
          background: var(--ink-2);
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 22px 24px 18px;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
          animation: dlg-pop 0.14s cubic-bezier(0.2, 0.9, 0.3, 1.2);
        }
        .dlg-title {
          margin: 0;
          font-family: var(--font-sans);
          font-size: 15px;
          font-weight: 600;
          color: var(--paper);
          line-height: 1.45;
        }
        .dlg-msg {
          margin: 8px 0 0;
          font-size: 13px;
          line-height: 1.6;
          color: var(--paper-mute);
        }
        .dlg-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 20px;
        }
        .dlg-btn {
          padding: 7px 16px;
          border-radius: 8px;
          font-family: var(--font-sans);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid transparent;
          transition: background 0.12s ease, border-color 0.12s ease;
        }
        .dlg-btn-ghost {
          background: transparent;
          border-color: var(--line);
          color: var(--paper-dim);
        }
        .dlg-btn-ghost:hover {
          border-color: var(--paper-mute);
          color: var(--paper);
        }
        .dlg-btn-accent {
          background: var(--accent);
          color: var(--ink);
        }
        .dlg-btn-accent:hover {
          background: color-mix(in oklch, var(--accent) 85%, white);
        }
        .dlg-btn-danger {
          background: var(--red);
          color: var(--paper);
        }
        .dlg-btn-danger:hover {
          background: color-mix(in oklch, var(--red) 85%, white);
        }
        .dlg-toasts {
          position: fixed;
          bottom: 28px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2147483000;
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: center;
          pointer-events: none;
        }
        .dlg-toast {
          pointer-events: auto;
          max-width: 380px;
          padding: 10px 18px;
          border-radius: 999px;
          background: var(--ink-3);
          border: 1px solid var(--line);
          color: var(--paper);
          font-size: 13px;
          line-height: 1.4;
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
          cursor: pointer;
          animation: dlg-toast-in 0.16s ease;
        }
        .dlg-toast-err {
          border-color: var(--red);
          color: var(--red);
        }
        @keyframes dlg-fade {
          from {
            opacity: 0;
          }
        }
        @keyframes dlg-pop {
          from {
            opacity: 0;
            transform: scale(0.94) translateY(6px);
          }
        }
        @keyframes dlg-toast-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
        }
      `}</style>
    </>
  );
}
