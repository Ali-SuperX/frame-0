"use client";

import { useRef, useState } from "react";
import { useStudioStore } from "@/lib/store";
import type { Mode } from "@/lib/bailian/models";
import { storeLocalFile } from "@/lib/editor/localFiles";
import { probeDuration } from "@/lib/editor/renderProject";

type Props = {
  open: boolean;
  onClose: () => void;
  zh: boolean;
  onCreated?: (id: string) => void;
  /** Override the modal header. Useful when embedding in Compare. */
  title?: { zh: string; en: string };
  /** Override the subtitle. */
  subtitle?: { zh: string; en: string };
};

const MODE_OPTIONS: Mode[] = ["t2v", "i2v", "r2v"];
type SourceKind = "url" | "file";

/**
 * Hand-enter an external video into the Archive without going through
 * the Bailian generation flow. Title + URL are required; everything else
 * is metadata that helps later comparison and search.
 */
export default function ManualEntryModal({
  open,
  onClose,
  zh,
  onCreated,
  title: headerTitle,
  subtitle: headerSubtitle,
}: Props) {
  const createManualWork = useStudioStore((s) => s.createManualWork);
  const [sourceKind, setSourceKind] = useState<SourceKind>("url");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [mode, setMode] = useState<Mode>("t2v");
  const [durationSec, setDurationSec] = useState<number | "">(5);
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setSourceKind("url");
    setFile(null);
    setTitle("");
    setUrl("");
    setPrompt("");
    setSourceLabel("");
    setMode("t2v");
    setDurationSec(5);
    setPublish(true);
    setErr(null);
  }

  async function submit() {
    setErr(null);
    const t = title.trim();
    if (!t) return setErr(zh ? "标题不能为空" : "Title required");

    setBusy(true);
    try {
      if (sourceKind === "file") {
        if (!file) {
          setBusy(false);
          return setErr(zh ? "请选择一个视频文件" : "Pick a video file");
        }
        if (!file.type.startsWith("video/")) {
          setBusy(false);
          return setErr(zh ? "仅支持视频文件" : "Video files only");
        }
        // 1. Create session-scoped blob URL for immediate playback
        const blobUrl = URL.createObjectURL(file);
        // 2. Probe duration for metadata
        let probed: number | undefined;
        try {
          probed = await probeDuration(blobUrl);
        } catch {
          /* non-fatal — user can still submit */
        }
        // 3. Persist bytes to IndexedDB so reloads don't break playback
        const key = `work_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        await storeLocalFile(key, file);
        // 4. Create the job entry
        const id = createManualWork({
          title: t,
          videoUrl: blobUrl,
          prompt: prompt || undefined,
          sourceLabel: sourceLabel || undefined,
          modelId: sourceLabel?.trim() || "external",
          mode,
          durationSec: typeof durationSec === "number" ? durationSec : probed,
          publish,
          localKey: key,
          localMime: file.type,
        });
        reset();
        onCreated?.(id);
        onClose();
      } else {
        const u = url.trim();
        if (!u) return setErr(zh ? "视频 URL 不能为空" : "Video URL required");
        if (!/^(https?:|data:|blob:|oss:)/.test(u))
          return setErr(
            zh
              ? "URL 需要以 https:// 或 http:// 开头"
              : "URL must start with http(s)://"
          );
        const id = createManualWork({
          title: t,
          videoUrl: u,
          prompt: prompt || undefined,
          sourceLabel: sourceLabel || undefined,
          modelId: sourceLabel?.trim() || "external",
          mode,
          durationSec:
            typeof durationSec === "number" ? durationSec : undefined,
          publish,
        });
        reset();
        onCreated?.(id);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="me-backdrop"
      onClick={onClose}
      role="dialog"
      aria-label="Manual archive entry"
    >
      <div className="me-panel" onClick={(e) => e.stopPropagation()}>
        <div className="me-head">
          <div>
            <div className="me-kicker">
              {headerTitle
                ? zh ? headerTitle.zh : headerTitle.en
                : zh ? "手工录入" : "Manual entry"}
            </div>
            <div className="me-sub">
              {headerSubtitle
                ? zh ? headerSubtitle.zh : headerSubtitle.en
                : zh
                  ? "把任何外部来源的视频加入档案，用于对比和记录"
                  : "Add a video from any external source to your archive"}
            </div>
          </div>
          <button
            type="button"
            className="me-close"
            onClick={onClose}
            aria-label="close"
          >
            ×
          </button>
        </div>

        <div className="me-body">
          <div className="me-row">
            <label>{zh ? "标题" : "Title"} *</label>
            <input
              className="me-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={zh ? "例：深夜的高速公路" : "e.g. Highway at night"}
              autoFocus
            />
          </div>

          <div className="me-row">
            <div className="me-label-row">
              <label>{zh ? "视频来源" : "Video source"} *</label>
              <div className="me-source-tabs">
                <button
                  type="button"
                  className={`me-source-tab${sourceKind === "url" ? " on" : ""}`}
                  onClick={() => setSourceKind("url")}
                >
                  URL
                </button>
                <button
                  type="button"
                  className={`me-source-tab${sourceKind === "file" ? " on" : ""}`}
                  onClick={() => setSourceKind("file")}
                >
                  {zh ? "本地文件" : "Local file"}
                </button>
              </div>
            </div>
            {sourceKind === "url" ? (
              <>
                <input
                  className="me-input"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…/clip.mp4"
                />
                <span className="me-hint">
                  {zh
                    ? "支持 http(s)://、oss://、blob:。公网 .mp4 直链最稳。"
                    : "http(s)://, oss://, blob: all accepted. Public .mp4 works best."}
                </span>
              </>
            ) : (
              <>
                <div
                  className={`me-drop${file ? " has-file" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add("drag");
                  }}
                  onDragLeave={(e) => e.currentTarget.classList.remove("drag")}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("drag");
                    const f = e.dataTransfer.files?.[0];
                    if (f) setFile(f);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setFile(f);
                      e.target.value = "";
                    }}
                  />
                  {file ? (
                    <>
                      <div className="me-file-name">{file.name}</div>
                      <div className="me-file-meta">
                        {(file.size / 1024 / 1024).toFixed(1)} MB · {file.type}
                      </div>
                      <button
                        type="button"
                        className="me-file-clear"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                        }}
                      >
                        {zh ? "换一个" : "Replace"}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="me-drop-glyph">⬆</div>
                      <div className="me-drop-text">
                        {zh
                          ? "拖放视频，或点击选择"
                          : "Drop video here, or click to browse"}
                      </div>
                      <div className="me-drop-hint">
                        {zh
                          ? "存在浏览器 IndexedDB，刷新页面不丢"
                          : "Cached in browser IndexedDB, survives reload"}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="me-row-2col">
            <div className="me-row">
              <label>{zh ? "来源标注" : "Source label"}</label>
              <input
                className="me-input"
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                placeholder={zh ? "Kling Web / Runway / own" : "Kling Web / Runway"}
              />
            </div>
            <div className="me-row">
              <label>{zh ? "模式" : "Mode"}</label>
              <div className="me-segments">
                {MODE_OPTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`me-seg${mode === m ? " on" : ""}`}
                    onClick={() => setMode(m)}
                  >
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="me-row-2col">
            <div className="me-row">
              <label>{zh ? "时长（秒）" : "Duration (s)"}</label>
              <input
                className="me-input"
                type="number"
                min={1}
                value={durationSec}
                onChange={(e) =>
                  setDurationSec(
                    e.target.value === "" ? "" : Math.max(1, Number(e.target.value))
                  )
                }
              />
            </div>
            <div className="me-row">
              <label>{zh ? "发布状态" : "Publish"}</label>
              <button
                type="button"
                className={`me-toggle${publish ? " on" : ""}`}
                onClick={() => setPublish((v) => !v)}
                role="switch"
                aria-checked={publish}
              >
                <span className="me-toggle-knob" />
                <span>{publish ? (zh ? "已发布" : "published") : zh ? "未发布" : "draft"}</span>
              </button>
            </div>
          </div>

          <div className="me-row">
            <label>{zh ? "Prompt / 备注（选填）" : "Prompt / notes (optional)"}</label>
            <textarea
              className="me-input me-textarea"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={zh ? "留一句话说明这条是怎么来的" : "How was this made?"}
            />
          </div>

          {err && <div className="me-err">{err}</div>}
        </div>

        <div className="me-foot">
          <button type="button" className="me-cancel" onClick={onClose}>
            {zh ? "取消" : "Cancel"}
          </button>
          <button
            type="button"
            className="me-submit"
            onClick={submit}
            disabled={busy}
          >
            {busy
              ? zh ? "处理中…" : "Processing…"
              : zh ? "添加 →" : "Add →"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .me-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(3px);
          z-index: 95;
          display: grid;
          place-items: center;
          padding: 40px 20px;
        }
        .me-panel {
          background: var(--ink);
          border: 1px solid var(--line);
          max-width: 600px;
          width: 100%;
          max-height: min(88vh, 820px);
          display: flex;
          flex-direction: column;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
        }
        .me-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 18px 20px 14px;
          border-bottom: 1px solid var(--line);
        }
        .me-kicker {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 4px;
          font-weight: 600;
        }
        .me-sub {
          font-family: var(--serif);
          font-style: italic;
          font-size: 14px;
          color: var(--paper-dim);
        }
        .me-close {
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper-mute);
          width: 32px;
          height: 32px;
          font-size: 20px;
          cursor: pointer;
          font-family: var(--mono);
        }
        .me-close:hover {
          color: var(--paper);
          border-color: var(--paper);
        }
        .me-body {
          flex: 1;
          overflow-y: auto;
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .me-row {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .me-row-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .me-row label {
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--paper-mute);
        }
        .me-input {
          background: var(--ink-2);
          border: 1px solid var(--line);
          color: var(--paper);
          padding: 8px 10px;
          font-family: var(--mono);
          font-size: 13px;
          border-radius: 2px;
        }
        .me-input:focus {
          outline: none;
          border-color: var(--accent);
        }
        .me-textarea {
          font-family: var(--serif);
          font-style: italic;
          font-size: 14px;
          resize: vertical;
        }
        .me-label-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 2px;
        }
        .me-source-tabs {
          display: flex;
          gap: 2px;
          border: 1px solid var(--line);
          border-radius: 2px;
          overflow: hidden;
        }
        .me-source-tab {
          background: transparent;
          border: none;
          border-right: 1px solid var(--line);
          color: var(--paper-mute);
          padding: 4px 10px;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          font-weight: 600;
        }
        .me-source-tab:last-child {
          border-right: none;
        }
        .me-source-tab.on {
          background: var(--accent);
          color: var(--ink);
        }
        .me-drop {
          border: 1.5px dashed var(--line);
          padding: 26px 16px;
          text-align: center;
          cursor: pointer;
          transition: all 0.15s;
          border-radius: 2px;
        }
        .me-drop:hover,
        .me-drop.drag {
          border-color: var(--accent);
          background: color-mix(in oklab, var(--accent) 8%, transparent);
        }
        .me-drop.has-file {
          text-align: left;
          padding: 14px 16px;
          border-style: solid;
          border-color: var(--accent);
        }
        .me-drop-glyph {
          font-size: 22px;
          color: var(--accent);
          margin-bottom: 6px;
        }
        .me-drop-text {
          font-family: var(--font-mono);
          font-size: 12px;
          font-weight: 600;
          color: var(--paper);
          letter-spacing: 0.06em;
        }
        .me-drop-hint {
          margin-top: 4px;
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--paper-mute);
        }
        .me-file-name {
          font-family: var(--font-serif);
          font-size: 14px;
          color: var(--paper);
          margin-bottom: 2px;
          word-break: break-all;
        }
        .me-file-meta {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--paper-mute);
          letter-spacing: 0.04em;
        }
        .me-file-clear {
          margin-top: 6px;
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper-dim);
          padding: 3px 10px;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          border-radius: 2px;
        }
        .me-file-clear:hover {
          color: var(--paper);
          border-color: var(--paper-mute);
        }
        .me-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .me-hint {
          font-family: var(--mono);
          font-size: 10.5px;
          color: var(--paper-dim);
          opacity: 0.8;
        }
        .me-segments {
          display: flex;
          gap: 4px;
        }
        .me-seg {
          flex: 1;
          padding: 8px 6px;
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper-dim);
          font-family: var(--mono);
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          border-radius: 2px;
        }
        .me-seg.on {
          background: var(--paper);
          color: var(--ink);
          border-color: var(--paper);
        }
        .me-toggle {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 6px 14px 6px 6px;
          background: var(--ink-2);
          border: 1px solid var(--line);
          border-radius: 18px;
          cursor: pointer;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--paper-mute);
        }
        .me-toggle.on {
          border-color: var(--accent);
          color: var(--accent);
        }
        .me-toggle-knob {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--paper-mute);
          transition: all 0.15s;
        }
        .me-toggle.on .me-toggle-knob {
          background: var(--accent);
        }
        .me-err {
          color: #c44;
          font-family: var(--mono);
          font-size: 11.5px;
          padding: 8px 10px;
          background: color-mix(in oklab, #c44 16%, transparent);
          border: 1px solid #c44;
          border-radius: 2px;
        }
        .me-foot {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 14px 20px;
          border-top: 1px solid var(--line);
        }
        .me-cancel,
        .me-submit {
          padding: 10px 18px;
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
          border-radius: 2px;
        }
        .me-cancel {
          background: transparent;
          color: var(--paper);
          border: 1px solid var(--line);
        }
        .me-cancel:hover {
          border-color: var(--paper);
        }
        .me-submit {
          background: var(--accent);
          color: var(--ink);
          border: 1px solid var(--accent);
        }
        .me-submit:hover {
          filter: brightness(1.1);
        }
      `}</style>
    </div>
  );
}
