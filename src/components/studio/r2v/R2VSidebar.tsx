"use client";

import { useEffect, useState } from "react";
import { useR2VStore } from "@/lib/r2v/projectStore";
import { readInput } from "@/lib/r2v/filesystem";
import { confirmDialog } from "@/components/ui/Dialog";

type Props = {
  zh: boolean;
  open: boolean;
  onClose: () => void;
};

export default function R2VSidebar({ zh, open, onClose }: Props) {
  const rootHandle = useR2VStore((s) => s.rootHandle);
  const rootName = useR2VStore((s) => s.rootName);
  const projectIds = useR2VStore((s) => s.projectIds);
  const current = useR2VStore((s) => s.current);
  const unsavedDraft = useR2VStore((s) => s.unsavedDraft);

  const startBlankDraft = useR2VStore((s) => s.startBlankDraft);
  const openProject = useR2VStore((s) => s.openProject);
  const persistDraft = useR2VStore((s) => s.persistDraft);
  const pickRoot = useR2VStore((s) => s.pickRoot);
  const reauthorize = useR2VStore((s) => s.reauthorize);
  const closeProject = useR2VStore((s) => s.closeProject);
  const setStage = useR2VStore((s) => s.setStage);

  const [filter, setFilter] = useState("");
  /** Cached metadata per saved project — mode + title, lazy-loaded so the
   *  list can render mode badges without a synchronous read. Cleared if
   *  rootHandle changes. */
  const [projectMeta, setProjectMeta] = useState<
    Record<string, { mode?: "cinematic" | "ugc"; title?: string; chunkCount?: number }>
  >({});

  /* ── Lazy-load project metadata in batches (max 8 at a time) ── */
  useEffect(() => {
    if (!rootHandle || projectIds.length === 0) return;
    let cancelled = false;
    const missing = projectIds.filter((id) => !(id in projectMeta));
    if (missing.length === 0) return;
    (async () => {
      const next: typeof projectMeta = {};
      // Process in small batches to avoid hammering FSA / locking up UI.
      const batchSize = 8;
      for (let i = 0; i < missing.length; i += batchSize) {
        if (cancelled) return;
        const batch = missing.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (id) => {
            try {
              const input = await readInput(rootHandle, id);
              if (input) {
                next[id] = {
                  mode: input.mode,
                  title: input.title,
                  chunkCount: input.chunks?.length ?? 0,
                };
              }
            } catch {
              /* swallow per-project read errors */
            }
          })
        );
      }
      if (!cancelled && Object.keys(next).length > 0) {
        setProjectMeta((prev) => ({ ...prev, ...next }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-run when project list or root changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIds.join("|"), rootHandle]);

  const filtered = filter
    ? projectIds.filter((id) =>
        id.toLowerCase().includes(filter.toLowerCase())
      )
    : projectIds;

  async function pickNew() {
    if (current && unsavedDraft) {
      // Already on a draft — just bring stage back to 1 and reset fields.
      const ok = await confirmDialog({
        title: zh
          ? "当前还有未保存的草稿，确认丢弃并新建？"
          : "There's an unsaved draft. Discard it and start a new one?",
        danger: true,
      });
      if (!ok) return;
    }
    startBlankDraft(zh ? "zh" : "en");
    setStage(1);
    onClose();
  }

  return (
    <>
      <div
        className={`r2v-drawer-backdrop ${open ? "r2v-drawer-backdrop--open" : ""}`}
        aria-hidden={!open}
        onClick={onClose}
      />
      <aside
        className={`r2v-sidebar ${open ? "r2v-sidebar--open" : ""}`}
        aria-label="R2V Projects"
        aria-hidden={!open}
      >
      <header className="r2v-sidebar-head">
        <div className="r2v-sidebar-title">{zh ? "R2V 项目" : "R2V Projects"}</div>
        <button
          type="button"
          className="r2v-btn r2v-btn--primary r2v-btn--block"
          onClick={pickNew}
          title={zh ? "新建草稿（暂不需要授权目录）" : "Start a draft (no folder yet)"}
        >
          + {zh ? "新建" : "New"}
        </button>
      </header>

      {/* Active section — shows current draft or open project */}
      {current ? (
        <section className="r2v-sidebar-section">
          <div className="r2v-sidebar-label">
            {zh ? "当前" : "Active"}
          </div>
          <button
            type="button"
            className="r2v-sidebar-item r2v-sidebar-item--active"
            onClick={() => setStage(1)}
          >
            <span className="r2v-sidebar-name">
              {current.title || (zh ? "未命名草稿" : "Untitled draft")}
            </span>
            <span className="r2v-sidebar-sub">
              {unsavedDraft
                ? zh
                  ? "草稿（未保存到磁盘）"
                  : "Draft · in-memory"
                : current.projectId}
            </span>
          </button>
          <button
            type="button"
            className="r2v-sidebar-close"
            onClick={closeProject}
            title={zh ? "关闭" : "Close"}
          >
            {zh ? "关闭项目" : "Close project"}
          </button>
        </section>
      ) : null}

      {/* On-disk projects */}
      <section className="r2v-sidebar-section r2v-sidebar-section--grow">
        <div className="r2v-sidebar-label">
          {zh ? "已保存" : "Saved"}
          {projectIds.length > 0 ? (
            <span className="r2v-sidebar-count">{projectIds.length}</span>
          ) : null}
        </div>

        {!rootHandle ? (
          <p className="r2v-sidebar-hint">
            {zh
              ? "选个工作目录就能看到历史项目。新建草稿不需要先选。"
              : "Pick a workspace to list saved projects. Drafts work without one."}
          </p>
        ) : projectIds.length > 8 ? (
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={zh ? "搜索..." : "Filter..."}
            className="r2v-input r2v-input--small r2v-sidebar-filter"
          />
        ) : null}

        <ul className="r2v-sidebar-list">
          {filtered.map((id) => {
            const isActive = current?.projectId === id && !unsavedDraft;
            const meta = projectMeta[id];
            const mode = meta?.mode;
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`r2v-sidebar-item ${
                    isActive ? "r2v-sidebar-item--active" : ""
                  }`}
                  onClick={() => {
                    void openProject(id);
                    onClose();
                  }}
                  disabled={isActive}
                  title={meta?.title || id}
                >
                  <span className="r2v-sidebar-mode-icon" aria-hidden>
                    {mode === "ugc" ? "📱" : mode === "cinematic" ? "🎬" : "📄"}
                  </span>
                  <span className="r2v-sidebar-name-block">
                    <span className="r2v-sidebar-name">
                      {meta?.title || id}
                    </span>
                    {mode === "ugc" && meta?.chunkCount ? (
                      <span className="r2v-sidebar-name-sub">
                        {meta.chunkCount} {zh ? "段 chunks" : "chunks"}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Workspace status footer */}
      <footer className="r2v-sidebar-foot">
        <div className="r2v-sidebar-label">
          {zh ? "工作目录" : "Workspace"}
        </div>
        {rootHandle ? (
          <div className="r2v-workspace-badge">
            <span
              className="r2v-dot r2v-dot--ok"
              aria-hidden
            />
            <code title={rootName}>{rootName}</code>
            <button
              type="button"
              className="r2v-link"
              onClick={() => void pickRoot()}
              title={zh ? "更换目录" : "Change folder"}
            >
              {zh ? "更换" : "change"}
            </button>
          </div>
        ) : (
          <div className="r2v-workspace-badge r2v-workspace-badge--idle">
            <span className="r2v-dot" aria-hidden />
            <span>{zh ? "未连接" : "Not connected"}</span>
            <button
              type="button"
              className="r2v-btn r2v-btn--xs"
              onClick={() => void pickRoot()}
            >
              {zh ? "选目录" : "Pick"}
            </button>
          </div>
        )}
        {rootHandle && unsavedDraft ? (
          <button
            type="button"
            className="r2v-btn r2v-btn--ghost r2v-btn--block"
            onClick={() => void persistDraft()}
            title={zh ? "把当前草稿写入磁盘" : "Write the draft to disk"}
          >
            {zh ? "💾 保存当前草稿" : "💾 Save draft"}
          </button>
        ) : null}
        {!rootHandle ? null : (
          <button
            type="button"
            className="r2v-link r2v-sidebar-reauth"
            onClick={() => void reauthorize()}
            title={zh ? "如果文件操作失败，点这里" : "Click if file ops fail"}
          >
            {zh ? "重新授权" : "Re-authorize"}
          </button>
        )}
      </footer>
      </aside>
    </>
  );
}
