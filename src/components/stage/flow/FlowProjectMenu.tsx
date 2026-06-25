"use client";

// FlowProjectMenu — 顶栏项目选择器：当前项目名 + 下拉切换/新建/重命名/删除。
// 切换前先保存当前项目，保证不丢编辑。
import { useState } from "react";
import { useStudioStore } from "@/lib/store";
import { FlowIcon } from "./FlowIcon";

export default function FlowProjectMenu() {
  const projectList = useStudioStore((s) => s.projectList);
  const currentProjectId = useStudioStore((s) => s.currentProjectId);
  const openProject = useStudioStore((s) => s.openProject);
  const newProject = useStudioStore((s) => s.newProject);
  const renameProject = useStudioStore((s) => s.renameProject);
  const deleteProject = useStudioStore((s) => s.deleteProject);
  const saveCurrentProject = useStudioStore((s) => s.saveCurrentProject);
  const [open, setOpen] = useState(false);

  const current = projectList.find((p) => p.id === currentProjectId);

  async function switchTo(id: string) {
    if (id === currentProjectId) { setOpen(false); return; }
    await saveCurrentProject();
    await openProject(id);
    setOpen(false);
  }
  async function create() {
    const name = window.prompt("新项目名称", "新短剧");
    if (!name?.trim()) return;
    await saveCurrentProject();
    const id = await newProject(name.trim());
    if (id) await openProject(id);
    setOpen(false);
  }

  return (
    <div className="sf-pm">
      <button className="sf-pm-btn" onClick={() => setOpen((v) => !v)} title="切换 / 新建项目">
        <FlowIcon n="layers" s={14} sw={1.8} />
        <span className="sf-pm-name">{current?.name ?? "选择项目"}</span>
        <FlowIcon n="chevd" s={12} />
      </button>
      {open && (
        <>
          <div className="sf-pm-back" onClick={() => setOpen(false)} />
          <div className="sf-pm-pop">
            <div className="sf-pm-head">我的项目</div>
            <div className="sf-pm-list">
              {projectList.map((p) => (
                <div key={p.id} className={`sf-pm-item${p.id === currentProjectId ? " on" : ""}`}>
                  <button className="sf-pm-open" onClick={() => switchTo(p.id)}>
                    <FlowIcon n="film" s={13} sw={1.8} /><span>{p.name}</span>
                  </button>
                  <button className="sf-pm-ic" title="重命名" onClick={async () => {
                    const name = window.prompt("重命名项目", p.name);
                    if (name?.trim()) await renameProject(p.id, name.trim());
                  }}><FlowIcon n="edit" s={12} /></button>
                  <button className="sf-pm-ic sf-pm-del" title="删除" onClick={async () => {
                    if (window.confirm(`删除项目「${p.name}」？此操作不可恢复。`)) await deleteProject(p.id);
                  }}><FlowIcon n="close" s={12} sw={2.2} /></button>
                </div>
              ))}
              {!projectList.length && <div className="sf-pm-empty">还没有项目，新建一个开始创作</div>}
            </div>
            <button className="sf-pm-new" onClick={create}><FlowIcon n="plus" s={14} sw={2} />新建项目</button>
          </div>
        </>
      )}
    </div>
  );
}
