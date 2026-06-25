"use client";

/**
 * Single drop zone for the Compare deck. Appears above the preview pane while
 * the user is dragging a job card. Accepts `application/x-frame0-job` data.
 * CSS comes from Studio's global style block (classes `drop-row` / `drop-zone` etc).
 */
export default function DropTargets({
  zh,
  onDropCompare,
}: {
  zh: boolean;
  onDropCompare: (jobId: string) => void;
}) {
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const jobId = e.dataTransfer.getData("application/x-frame0-job");
    if (!jobId) return;
    onDropCompare(jobId);
    document.body.removeAttribute("data-job-dragging");
  }
  function allow(e: React.DragEvent) {
    if (e.dataTransfer.types.includes("application/x-frame0-job")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }
  return (
    <div className="drop-row">
      <div
        className="drop-zone dz-compare"
        onDragOver={allow}
        onDragEnter={allow}
        onDrop={handleDrop}
      >
        <span className="dz-glyph">⇌</span>
        <span className="dz-label">
          {zh ? "拖到这里加入对比台" : "Drop to Compare"}
        </span>
      </div>
    </div>
  );
}
