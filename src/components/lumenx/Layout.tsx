"use client";

/**
 * LumenXLayout —— LumenX 4-Tab 主布局。
 *
 * 结构：
 *   ┌─ TopBar（返回 + 项目标题 + 4 个 Tab + 右侧工具 slot）
 *   └─ Body
 *       ├─ Content（左侧 Tab 内容；children 渲染）
 *       ├─ Divider（可拖拽分割条，调整左右比例）
 *       └─ ChatSlot（右侧 AI 对话面板占位，由 ChatPanel 实际填充）
 *
 * Tab 切换：点击调用 useLumenStore.setTab，当前 Tab 从 currentProject.tab 读。
 * 分割比例：local state，默认 65/35，最小左 40%、右 25%；不持久化。
 */

import * as React from "react";
import { useLumenStore, useCurrentProject } from "@/lib/lumenx/store";
import { useToastStore } from "@/lib/lumenx/toast";
import type { LxTab } from "@/lib/lumenx/types";
import ChatPanel from "./ChatPanel";
import ImageLightbox from "./ImageLightbox";

// ----------------------------------------------------------------------------
// Tab 配置
// ----------------------------------------------------------------------------

type TabDef = { id: LxTab; label: string; icon: string };

const TABS: readonly TabDef[] = [
  { id: "script", label: "剧本", icon: "📝" },
  { id: "character", label: "角色", icon: "👤" },
  { id: "storyboard", label: "分镜", icon: "🎬" },
  { id: "timeline", label: "时间轴", icon: "⏱" },
] as const;

// ----------------------------------------------------------------------------
// 拖拽分割条边界
// ----------------------------------------------------------------------------

const MIN_LEFT_PCT = 40;
const MAX_LEFT_PCT = 75; // 等价于右侧最小 25%
const DEFAULT_LEFT_PCT = 65;

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export default function LumenXLayout({ children }: { children: React.ReactNode }) {
  const project = useCurrentProject();
  const setTab = useLumenStore((s) => s.setTab);
  const patch = useLumenStore((s) => s.patch);
  const open = useLumenStore((s) => s.open);

  const activeTab: LxTab = project?.tab ?? "script";
  const title = project?.title ?? "未命名短剧";

  // 标题行内编辑
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(title);
  React.useEffect(() => {
    if (!editingTitle) setTitleDraft(title);
  }, [title, editingTitle]);

  const commitTitle = React.useCallback(() => {
    const next = titleDraft.trim();
    if (next && next !== title) patch({ title: next });
    setEditingTitle(false);
  }, [titleDraft, title, patch]);

  // 键盘快捷键：Alt+1~4 切换 Tab
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const tabMap: Record<string, LxTab> = {
        "1": "script",
        "2": "character",
        "3": "storyboard",
        "4": "timeline",
      };
      const tab = tabMap[e.key];
      if (tab) {
        e.preventDefault();
        setTab(tab);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setTab]);

  // Toast
  const toast = useToastStore((s) => s.toast);
  const [toastLeaving, setToastLeaving] = React.useState(false);
  const prevToastId = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (toast && toast.id !== prevToastId.current) {
      setToastLeaving(false);
      prevToastId.current = toast.id;
    }
    if (!toast && prevToastId.current !== null) {
      setToastLeaving(true);
      const t = setTimeout(() => setToastLeaving(false), 200);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Tab 切换时记忆/恢复滚动位置
  const contentRef = React.useRef<HTMLDivElement>(null);
  const scrollPositions = React.useRef<Record<string, number>>({});
  const visitedTabs = React.useRef<Set<string>>(new Set());

  const handleTabSwitch = React.useCallback(
    (tab: LxTab) => {
      // 保存当前 tab 滚动位置
      if (contentRef.current) {
        scrollPositions.current[activeTab] = contentRef.current.scrollTop;
      }
      setTab(tab);
      // 首次进入该 tab → 滚到顶；之后恢复之前位置
      requestAnimationFrame(() => {
        if (contentRef.current) {
          if (visitedTabs.current.has(tab)) {
            contentRef.current.scrollTop = scrollPositions.current[tab] || 0;
          } else {
            contentRef.current.scrollTop = 0;
            visitedTabs.current.add(tab);
          }
        }
      });
    },
    [setTab, activeTab],
  );

  // 右键上下文菜单状态
  const [contextMenu, setContextMenu] = React.useState<{
    x: number;
    y: number;
    items: Array<{ label: string; action: () => void; danger?: boolean }>;
  } | null>(null);

  // 点击任意处关闭菜单
  React.useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [contextMenu]);

  // 通过 CustomEvent 让子组件触发菜单
  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setContextMenu(detail);
    };
    window.addEventListener("lx-context-menu", handler);
    return () => window.removeEventListener("lx-context-menu", handler);
  }, []);

  // Escape 关闭 context menu
  React.useEffect(() => {
    if (!contextMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [contextMenu]);

  // 左右分栏比例
  const [leftPct, setLeftPct] = React.useState<number>(DEFAULT_LEFT_PCT);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const draggingRef = React.useRef(false);
  const dividerRef = React.useRef<HTMLDivElement | null>(null);

  const onDividerMouseDown = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    dividerRef.current?.classList.add("is-dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const el = bodyRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(MAX_LEFT_PCT, Math.max(MIN_LEFT_PCT, pct));
      setLeftPct(clamped);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      dividerRef.current?.classList.remove("is-dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div className="lx-layout">
      {/* ── TopBar ───────────────────────────────────────────────── */}
      <header className="lx-topbar">
        <div className="lx-topbar-left">
          <button
            type="button"
            className="lx-back-btn"
            onClick={() => open(null)}
            title="返回项目列表"
            aria-label="返回项目列表"
          >
            <span aria-hidden>←</span>
            <span>返回</span>
          </button>

          {editingTitle ? (
            <input
              className="lx-title-input"
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle();
                if (e.key === "Escape") {
                  setTitleDraft(title);
                  setEditingTitle(false);
                }
              }}
              maxLength={64}
            />
          ) : (
            <button
              type="button"
              className="lx-title"
              onClick={() => setEditingTitle(true)}
              title="点击编辑标题"
            >
              {title}
            </button>
          )}
        </div>

        <nav className="lx-topbar-center" role="tablist" aria-label="AI 片场主导航">
          {TABS.map((t) => {
            const active = t.id === activeTab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={"lx-tab-btn" + (active ? " active" : "")}
                onClick={() => handleTabSwitch(t.id)}
              >
                <span className="lx-tab-icon" aria-hidden>
                  {t.icon}
                </span>
                <span className="lx-tab-label">{t.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="lx-topbar-right">
          {/* 预留工具按钮 slot（设置 / 导出 等，由后续任务填充） */}
        </div>
      </header>

      {/* ── Body：左内容 + Divider + 右对话 ──────────────────────── */}
      <div className="lx-body" ref={bodyRef}>
        <main
          className="lx-content"
          ref={contentRef}
          style={{ width: `${leftPct}%` }}
          role="tabpanel"
          aria-label={`${TABS.find((t) => t.id === activeTab)?.label ?? ""} 内容`}
        >
          {children}
        </main>

        <div
          className="lx-divider"
          ref={dividerRef}
          role="separator"
          aria-orientation="vertical"
          aria-label="拖拽调整左右宽度"
          onMouseDown={onDividerMouseDown}
        >
          <div className="lx-divider-handle" aria-hidden />
        </div>

        <aside
          className="lx-chat-slot"
          style={{ width: `${100 - leftPct}%` }}
          aria-label="AI 对话面板"
        >
          <ChatPanel />
        </aside>
      </div>

      {/* 全局 Lightbox（单例，供各 Tab 卸资产点击使用） */}
      <ImageLightbox />

      {/* 右键上下文菜单 */}
      {contextMenu && (
        <div
          className="lx-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.items.map((item, i) =>
            item.label === "---" ? (
              <div key={i} className="lx-context-menu-divider" />
            ) : (
              <button
                key={i}
                type="button"
                className={`lx-context-menu-item${item.danger ? " danger" : ""}`}
                onClick={() => {
                  item.action();
                  setContextMenu(null);
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}

      {/* Toast 通知 */}
      {(toast || toastLeaving) && (
        <div
          className={`lx-toast lx-toast-${toast?.type ?? "info"}${toastLeaving ? " leaving" : ""}`}
          role="alert"
          aria-live="polite"
        >
          <span aria-hidden>
            {toast?.type === "success" ? "✓" : toast?.type === "error" ? "✗" : "ℹ"}
          </span>
          <span>{toast?.message}</span>
        </div>
      )}
    </div>
  );
}
