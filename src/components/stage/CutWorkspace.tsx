"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import {
  useStudioStore,
  type Series,
  type StageEpisode,
  type StageShot,
  type Job,
} from "@/lib/store";
import { seriesToEditorProject } from "@/lib/stage/episodeToEditor";

type Props = { series: Series; episode: StageEpisode; zh: boolean };

export default function CutWorkspace({ series, episode, zh }: Props) {
  const jobs = useStudioStore((s) => s.jobs);
  const editorLoadProject = useStudioStore((s) => s.editorLoadProject);
  const router = useRouter();
  const locale = useLocale();

  const jobById = useMemo(() => {
    const m = new Map<string, Job>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  const allShots = useMemo(() => {
    const out: StageShot[] = [];
    for (const sc of episode.scenes) for (const sh of sc.shots) out.push(sh);
    return out;
  }, [episode]);

  const totalDuration = allShots.reduce((s, sh) => s + sh.durationSec, 0);

  function shotHasMedia(sh: StageShot): boolean {
    if (sh.videoJobId && jobById.get(sh.videoJobId)?.videoUrl) return true;
    if (sh.imageJobId) {
      const j = jobById.get(sh.imageJobId);
      if (j?.media?.img_url?.url) return true;
    }
    return false;
  }

  const readyCount = allShots.filter(shotHasMedia).length;

  function handleExport() {
    const { project, stats } = seriesToEditorProject(episode, series, jobById);
    editorLoadProject(project);
    const msg = zh
      ? `已导出到剪辑：${stats.ok} 拍成功${stats.skipped ? `，${stats.skipped} 拍跳过（无素材）` : ""}`
      : `Exported: ${stats.ok} ok${stats.skipped ? `, ${stats.skipped} skipped` : ""}`;
    alert(msg);
    router.push(locale === "zh" ? "/editor" : "/en/editor");
  }

  return (
    <div className="cut">
      <div className="cut-toolbar">
        <span className="cut-stat">
          {readyCount}/{allShots.length} {zh ? "拍就绪" : "shots ready"}
          {" · "}
          {Math.floor(totalDuration / 60)}:{String(Math.round(totalDuration % 60)).padStart(2, "0")}
        </span>
        <button className="cut-export-btn" disabled={readyCount === 0} onClick={handleExport}>
          {zh ? "导出到剪辑" : "Export to Editor"}
        </button>
      </div>

      <div className="cut-timeline">
        {allShots.map((sh) => {
          const hasMedia = shotHasMedia(sh);
          const widthPct = totalDuration > 0 ? (sh.durationSec / totalDuration) * 100 : 0;
          const el = sh.elementRefs[0] ? series.bible.find((e) => e.id === sh.elementRefs[0]) : null;

          return (
            <div
              key={sh.id}
              className={`cut-clip${hasMedia ? "" : " cut-clip-empty"}`}
              style={{ width: `${Math.max(widthPct, 2)}%`, borderLeftColor: el?.color }}
              title={`#${sh.idx} · ${sh.durationSec}s · ${sh.shotType}`}
            >
              <span className="cut-clip-idx">{sh.idx}</span>
              <span className="cut-clip-dur">{sh.durationSec}s</span>
            </div>
          );
        })}
      </div>

      {allShots.length === 0 && (
        <div className="cut-empty">
          {zh ? "还没有拍。先到「剧本」或「分镜」添加内容。" : "No shots. Add content in Script or Board."}
        </div>
      )}

      <div className="cut-preview">
        <div className="cut-preview-ph">
          {zh ? "预览区（拍排好即时间线）" : "Preview (shots = timeline)"}
        </div>
      </div>
    </div>
  );
}
