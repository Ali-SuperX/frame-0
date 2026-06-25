"use client";

/**
 * UGC Batch Submit — fan-out all chunks in parallel.
 *
 * Sits inside Card 3 (below the UGC banner) when `cur.mode === "ugc"`.
 * Constructs N independent submissions from `cur.chunks` + `cur.universalBlocks`,
 * fires them in parallel, polls each, downloads + saves to `<project>/videos/`.
 *
 * Doesn't touch the existing single-shot submit flow in Card 3 — they coexist:
 *   - Single flow:   uses `promptOutput.prompt` (one video)
 *   - Batch flow:    iterates cur.chunks (N videos, parallel)
 *
 * Why prompts are built locally (not from prompt.md):
 *   prompt.md is a single string; parsing it back into N chunks is brittle.
 *   Since input.json already has chunks[] + universalBlocks, build per-chunk
 *   prompts here. The Claude `/ugc` skill produces a *human-readable* preview
 *   of the same thing, but isn't required for submission.
 */

import { useEffect, useRef, useState } from "react";
import { useR2VStore } from "@/lib/r2v/projectStore";
import { submitJobRequest } from "@/lib/bailian/submitJob";
import { apiKeysHeader } from "@/lib/bailian/withUserKeys";
import { HOOK_TYPES } from "@/lib/r2v/presets";

type Props = { zh: boolean };

const POLL_INTERVAL_MS = 4000;

type Status =
  | { kind: "pending" }
  | { kind: "submitting" }
  | { kind: "running"; taskId: string; startedAt: number }
  | { kind: "saving"; taskId: string; videoUrl: string }
  | { kind: "done"; filename: string }
  | { kind: "error"; message: string };

type ChunkTask = {
  chunkIndex: number;
  status: Status;
};

/** Compose the per-chunk prompt from universalBlocks + chunk fields. */
function buildChunkPrompt(
  zh: boolean,
  universal: NonNullable<ReturnType<typeof useR2VStore.getState>["current"]>["universalBlocks"],
  chunk: NonNullable<ReturnType<typeof useR2VStore.getState>["current"]>["chunks"][number],
  productRefName: string | undefined
): string {
  const u = universal ?? {};
  const lines: string[] = [];
  if (u.characterLock?.trim()) {
    lines.push(`[Character Lock]\n${u.characterLock.trim()}`);
  }
  if (u.actionDirection?.trim()) {
    lines.push(`[Action Direction]\n${u.actionDirection.trim()}`);
  }
  if (u.realismBlock?.trim()) {
    lines.push(`[Realism Block]\n${u.realismBlock.trim()}`);
  }
  if (u.excludeBlock?.trim()) {
    lines.push(`[Exclude Block]\n${u.excludeBlock.trim()}`);
  }
  lines.push("");
  lines.push(`Chunk ${chunk.index} · ${chunk.runtime ?? 6}s`);
  if (chunk.hookType) {
    const h = HOOK_TYPES.find((x) => x.id === chunk.hookType);
    if (h) {
      lines.push(`Hook framework: ${zh ? h.zh.label : h.en.label}`);
    }
  }
  if (chunk.framing?.trim()) {
    lines.push("");
    lines.push(`Framing: ${chunk.framing.trim()}`);
  }
  if (chunk.voiceover?.trim()) {
    lines.push("");
    lines.push(
      zh
        ? `She says (in Chinese, conversational tone): "${chunk.voiceover.trim()}"`
        : `She says (conversational, natural): "${chunk.voiceover.trim()}"`
    );
  }
  // Product control
  const hasProduct = !!productRefName;
  if (chunk.includeProduct && hasProduct) {
    lines.push("");
    lines.push(
      `Product ${productRefName} naturally in frame. Keep its geometry, label, and proportions identical to the reference image.`
    );
  } else if (hasProduct) {
    lines.push("");
    lines.push(`${productRefName} MUST NOT appear in frame.`);
  }
  return lines.join("\n");
}

export default function UGCBatchSubmit({ zh }: Props) {
  const cur = useR2VStore((s) => s.current);
  const ingestVideo = useR2VStore((s) => s.ingestVideo);

  const [tasks, setTasks] = useState<Record<number, ChunkTask>>({});
  const [now, setNow] = useState<number>(() => Date.now());
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  /* Reset on project change is handled by the parent via `key={projectId}`,
   *  which causes React to unmount + remount this component (clean state). */

  /* Tick `now` while any chunk is running */
  useEffect(() => {
    const anyRunning = Object.values(tasks).some(
      (t) => t.status.kind === "running"
    );
    if (!anyRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [tasks]);

  if (!cur || cur.mode !== "ugc" || cur.chunks.length === 0) return null;

  const productRef = cur.references.find(
    (r) => r.role === "product" && r.url
  );
  const characterRefs = cur.references.filter(
    (r) => r.role === "character" && r.url
  );

  function updateTask(idx: number, patch: Partial<ChunkTask>) {
    setTasks((prev) => ({
      ...prev,
      [idx]: { ...prev[idx], ...patch, chunkIndex: idx },
    }));
  }

  async function submitChunk(chunkIndex: number) {
    if (!cur) return;
    const chunk = cur.chunks.find((c) => c.index === chunkIndex);
    if (!chunk) return;

    updateTask(chunkIndex, { status: { kind: "submitting" } });

    const includeProductRef =
      chunk.includeProduct && productRef ? [productRef] : [];
    // Always include character refs (model identity)
    const refUrls = [...characterRefs, ...includeProductRef].map((r) => ({
      url: r.url,
      name: r.name,
    }));

    if (refUrls.length === 0) {
      updateTask(chunkIndex, {
        status: {
          kind: "error",
          message: zh
            ? "缺少参考图（至少需要一张 role=character 的图）"
            : "No reference images (need at least one role=character)",
        },
      });
      return;
    }

    const prompt = buildChunkPrompt(
      zh,
      cur.universalBlocks,
      chunk,
      productRef?.name
    );

    try {
      const { taskId } = await submitJobRequest({
        modelId: "happyhorse-1.1-r2v",
        params: {
          resolution: cur.output.resolution,
          ratio: cur.output.ratio,
          duration: chunk.runtime ?? 6,
          watermark: cur.output.watermark,
        },
        media: { reference_urls: refUrls },
        prompt,
      });
      if (!taskId) throw new Error("提交失败：未返回 taskId");

      // eslint-disable-next-line react-hooks/purity -- event-handler context, not render
      const startedAt = Date.now();
      updateTask(chunkIndex, {
        status: { kind: "running", taskId, startedAt },
      });

      // Poll
      while (!cancelRef.current.cancelled) {
        await sleep(POLL_INTERVAL_MS);
        if (cancelRef.current.cancelled) return;
        const qs = new URLSearchParams({
          task_id: taskId,
          model_id: "happyhorse-1.1-r2v",
        });
        const res = await fetch(`/api/bailian/poll?${qs.toString()}`, {
          cache: "no-store",
          headers: apiKeysHeader(),
        });
        const s = await res.json();
        if (s.state === "done") {
          const videoUrl: string = s.localPath || s.videoUrl;
          updateTask(chunkIndex, {
            status: { kind: "saving", taskId, videoUrl },
          });
          try {
            const blob = await fetch(videoUrl).then((r) => r.blob());
            const filename = await ingestVideo(blob, `chunk-${chunkIndex}`);
            updateTask(chunkIndex, {
              status: { kind: "done", filename: filename ?? `chunk-${chunkIndex}.mp4` },
            });
          } catch (err) {
            updateTask(chunkIndex, {
              status: {
                kind: "error",
                message: `Save failed: ${(err as Error)?.message ?? String(err)}`,
              },
            });
          }
          return;
        }
        if (s.state === "error" || s.state === "failed") {
          updateTask(chunkIndex, {
            status: {
              kind: "error",
              message: s.error || s.message || "Generation failed",
            },
          });
          return;
        }
      }
    } catch (err) {
      updateTask(chunkIndex, {
        status: {
          kind: "error",
          message: (err as Error)?.message ?? String(err),
        },
      });
    }
  }

  function submitAll() {
    cancelRef.current = { cancelled: false };
    cur!.chunks.forEach((c) => {
      void submitChunk(c.index);
    });
  }

  function retryChunk(idx: number) {
    void submitChunk(idx);
  }

  function cancelAll() {
    cancelRef.current.cancelled = true;
    setTasks((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        const idx = Number(k);
        const t = next[idx];
        if (t.status.kind === "running" || t.status.kind === "submitting") {
          next[idx] = { ...t, status: { kind: "pending" } };
        }
      }
      return next;
    });
  }

  const allDone = cur.chunks.every(
    (c) => tasks[c.index]?.status.kind === "done"
  );
  const anyRunning = Object.values(tasks).some(
    (t) => t.status.kind === "running" || t.status.kind === "submitting"
  );
  const someStarted = Object.keys(tasks).length > 0;

  return (
    <section className="r2v-batch">
      <header className="r2v-batch-head">
        <h3>
          🚀 {zh ? "多 chunk 并行提交" : "Fan-out submit"}
          <span className="r2v-count">
            {cur.chunks.length} {zh ? "段" : "chunks"}
          </span>
        </h3>
        <div className="r2v-batch-actions">
          {anyRunning ? (
            <button
              type="button"
              className="r2v-btn r2v-btn--ghost"
              onClick={cancelAll}
            >
              {zh ? "取消进行中" : "Cancel running"}
            </button>
          ) : null}
          <button
            type="button"
            className="r2v-btn r2v-btn--primary"
            onClick={submitAll}
            disabled={anyRunning}
          >
            {someStarted
              ? zh
                ? `🚀 全部重提（${cur.chunks.length} 段）`
                : `🚀 Resubmit all (${cur.chunks.length})`
              : zh
                ? `🚀 全部并行提交（${cur.chunks.length} 段）`
                : `🚀 Submit all in parallel (${cur.chunks.length})`}
          </button>
        </div>
      </header>

      <div className="r2v-batch-grid">
        {cur.chunks.map((c) => {
          const task = tasks[c.index];
          const status = task?.status ?? { kind: "pending" };
          return (
            <ChunkTaskRow
              key={c.index}
              chunkIndex={c.index}
              chunkRuntime={c.runtime ?? 6}
              chunkPreview={
                c.voiceover?.slice(0, 60) ||
                (zh ? "（无 voiceover）" : "(no voiceover)")
              }
              includeProduct={!!c.includeProduct}
              isHook={c.index === 1 && !!c.hookType}
              status={status}
              now={now}
              zh={zh}
              onRetry={() => retryChunk(c.index)}
            />
          );
        })}
      </div>

      {allDone && cur.chunks.length > 0 ? (
        <div className="r2v-batch-done-banner" role="status">
          ✅{" "}
          {zh
            ? `全部 ${cur.chunks.length} 段已生成 — 在下方"后期"区拼接 + 加字幕 + BGM`
            : `All ${cur.chunks.length} chunks generated — stitch + caption + BGM in the post-process section below`}
        </div>
      ) : null}
    </section>
  );
}

function ChunkTaskRow({
  chunkIndex,
  chunkRuntime,
  chunkPreview,
  includeProduct,
  isHook,
  status,
  now,
  zh,
  onRetry,
}: {
  chunkIndex: number;
  chunkRuntime: number;
  chunkPreview: string;
  includeProduct: boolean;
  isHook: boolean;
  status: Status;
  now: number;
  zh: boolean;
  onRetry: () => void;
}) {
  const elapsed =
    status.kind === "running" ? Math.floor((now - status.startedAt) / 1000) : 0;

  const badge = (() => {
    switch (status.kind) {
      case "pending":
        return { cls: "pending", text: zh ? "待提交" : "Pending" };
      case "submitting":
        return { cls: "running", text: zh ? "提交中…" : "Submitting…" };
      case "running":
        return {
          cls: "running",
          text: zh ? `渲染中 ${elapsed}s` : `Running ${elapsed}s`,
        };
      case "saving":
        return { cls: "running", text: zh ? "保存中…" : "Saving…" };
      case "done":
        return { cls: "done", text: zh ? "✓ 完成" : "✓ Done" };
      case "error":
        return { cls: "error", text: status.message };
    }
  })();

  return (
    <div className={`r2v-batch-row r2v-batch-row--${badge.cls}`}>
      <div className="r2v-batch-num">
        #{chunkIndex}
        {isHook ? <span className="r2v-batch-hookmark"> 🪝</span> : null}
        {includeProduct ? <span className="r2v-batch-pmark"> 📦</span> : null}
      </div>
      <div className="r2v-batch-meta">
        <span className="r2v-batch-runtime">{chunkRuntime}s</span>
        <span className="r2v-batch-preview" title={chunkPreview}>
          {chunkPreview}
        </span>
      </div>
      <span className={`r2v-batch-badge r2v-batch-badge--${badge.cls}`}>
        {badge.text}
      </span>
      <div className="r2v-batch-row-actions">
        {status.kind === "error" || status.kind === "done" ? (
          <button
            type="button"
            className="r2v-btn r2v-btn--ghost r2v-btn--xs"
            onClick={onRetry}
            title={zh ? "重新生成此段" : "Regenerate this chunk"}
          >
            ↻
          </button>
        ) : null}
      </div>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise<void>((r) => window.setTimeout(r, ms));
}
