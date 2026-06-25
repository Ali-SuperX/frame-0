import Link from "next/link";
import TopNav from "@/components/TopNav";

/** 英文 help 页面 — 原 src/app/[locale]/help/page.tsx 的 EN 部分原样保留。
 *  中文版已升级为 HelpLayout（深度文档），英文暂不翻译新内容，避免低质 AI 译。 */
export function EnglishLegacyHelp() {
  return (
    <div className="app">
      <header className="chrome">
        <div className="left">
          <Link href="/en" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="logo">
              Frame<span style={{ color: "var(--accent)" }}>/</span>0
            </div>
          </Link>
        </div>
        <TopNav />
        <div className="right" />
      </header>

      <main className="help-main">
        <section className="help-hero">
          <p className="help-eyebrow">Documentation</p>
          <h1 className="help-title">
            Frame<span className="help-accent">/</span>0
          </h1>
          <p className="help-subtitle">
            An end-to-end AI visual creation platform. From text to visuals, inspiration to final cut —
            AI image generation, AI video generation, multi-track editing, and inspiration aggregation in one seamless workflow.
          </p>
        </section>

        <section className="help-section">
          <div className="help-section-header">
            <span className="help-section-num">01</span>
            <h2 className="help-section-heading">AI Image Generation</h2>
          </div>
          <p className="help-section-intro">
            Switch to the &quot;Generate Image&quot; tab in the Studio right panel to create high-quality images from
            natural language descriptions. Generated images can be directly used as first-frame references for video generation.
          </p>
          <div className="help-feature-list">
            <div className="help-fl-item"><h3>Text-to-Image (T2I)</h3><p>Enter a scene description, choose resolution and style, and the model generates the corresponding image. Supports multiple aspect ratios: 1:1, 16:9, 9:16, 4:3, 3:4, etc.</p></div>
            <div className="help-fl-item"><h3>Style Control</h3><p>Multiple preset styles — photorealistic, anime illustration, 3D render, watercolor, oil painting, and more.</p></div>
            <div className="help-fl-item"><h3>Batch Generation &amp; Iteration</h3><p>Generate multiple variants per run. One-click &quot;use as video first frame&quot; seamlessly transitions to the I2V pipeline.</p></div>
            <div className="help-fl-item"><h3>Parameter Tuning</h3><p>Configure resolution (up to 2K), sampling steps, guidance scale (CFG), and other advanced parameters.</p></div>
          </div>
        </section>

        <section className="help-section">
          <div className="help-section-header">
            <span className="help-section-num">02</span>
            <h2 className="help-section-heading">AI Video Generation</h2>
          </div>
          <p className="help-section-intro">
            The core capability of Frame/0. Aggregates HappyHorse / Wan / PixVerse / Kling and more video models
            on the Bailian platform, supporting three video generation modes covering the full pipeline.
          </p>
          <div className="help-feature-list">
            <div className="help-fl-item"><h3>Text-to-Video (T2V)</h3><p>Pure text-driven. Describe scene content, camera movement, visual style, and pacing — the model generates matching video clips. Supports 720p resolution, with 5s/10s duration options.</p></div>
            <div className="help-fl-item"><h3>Image-to-Video (I2V)</h3><p>Upload an image as the first-frame anchor, describe motion direction and rhythm in text — AI extends it into smooth motion video.</p></div>
            <div className="help-fl-item"><h3>Reference Video Generation (R2V)</h3><p>Use existing video as motion or style reference. Upload multiple reference images + a reference video + text description simultaneously for collaborative control.</p></div>
            <div className="help-fl-item"><h3>Director&apos;s Deck</h3><p>Manage multiple generation schemes side by side in one interface. Compare different prompts/parameters simultaneously to quickly identify the best result.</p></div>
            <div className="help-fl-item"><h3>Job Queue &amp; State Persistence</h3><p>All generation jobs are queued automatically, executed in background with real-time progress percentage. State is persisted via IndexedDB.</p></div>
          </div>
        </section>

        <section className="help-section">
          <div className="help-section-header">
            <span className="help-section-num">03</span>
            <h2 className="help-section-heading">Multi-track Editor</h2>
          </div>
          <p className="help-section-intro">
            A built-in non-linear editor rivaling professional editing software. Complete rough-cut to fine-tune
            without switching to external tools.
          </p>
          <div className="help-feature-list">
            <div className="help-fl-item"><h3>Unlimited Track Timeline</h3><p>Unlimited video and audio tracks. Drag clips to any track at any time position with precise layering and alignment control.</p></div>
            <div className="help-fl-item"><h3>Media Import</h3><p>Drag AI-generated results directly into the timeline, or upload local video, image, and audio files. Supported formats: MP4, WebM, MOV, MP3, WAV, AAC, PNG, JPG, WebP.</p></div>
            <div className="help-fl-item"><h3>9 Filter Presets</h3><p>Select a clip and apply filters: Warm, Cool, Cinematic, B&amp;W, Vintage, Vivid, Dramatic, Pastel.</p></div>
            <div className="help-fl-item"><h3>Picture-in-Picture (PiP)</h3><p>Set X/Y offset and scale (0.1x–2x) for overlay track clips.</p></div>
            <div className="help-fl-item"><h3>Per-clip Transitions</h3><p>Assign entry transitions per clip: Fade, Slide, Zoom, Spin, Wipe. Customize duration (0.1s–2s).</p></div>
            <div className="help-fl-item"><h3>Speed Curves</h3><p>5 curve types: Linear, Ease-in, Ease-out, Slow→Fast, Fast→Slow.</p></div>
            <div className="help-fl-item"><h3>Fine-grained Audio Control</h3><p>Per-clip control: volume (0%–200%), fade-in/out duration, mute toggle, pitch shift (-12 to +12 semitones).</p></div>
            <div className="help-fl-item"><h3>Opacity &amp; Overlay</h3><p>Adjust per-clip opacity (0%–100%) for dissolve, ghosting, and translucent overlay effects.</p></div>
            <div className="help-fl-item"><h3>Quick Actions</h3><p>Ctrl+D duplicate · Delete remove · Space play/pause · Drag clip edges to trim · Right-click context menu · Multi-clip selection.</p></div>
          </div>
        </section>

        <section className="help-section">
          <div className="help-section-header">
            <span className="help-section-num">04</span>
            <h2 className="help-section-heading">Compare</h2>
          </div>
          <p className="help-section-intro">
            Check videos in the Archive for comparison, then enter the Compare view to play them side by side
            and examine differences frame by frame.
          </p>
          <div className="help-feature-list">
            <div className="help-fl-item"><h3>Before/After Slider</h3><p>Drag the center line between two video frames to precisely compare subtle differences.</p></div>
            <div className="help-fl-item"><h3>Multi-card Grid Layout</h3><p>Select multiple videos for a grid card layout. Perfect for quickly screening the best results.</p></div>
          </div>
        </section>

        <section className="help-section">
          <div className="help-section-header">
            <span className="help-section-num">05</span>
            <h2 className="help-section-heading">Discover</h2>
          </div>
          <p className="help-section-intro">
            Aggregate AI video/image creation inspiration from across the web. Break through creative blocks
            with persistent caching — browsed content won&apos;t be lost on refresh.
          </p>
          <div className="help-feature-list">
            <div className="help-fl-item"><h3>Multi-platform Sources</h3><p>Currently integrated with Reddit and CivitAI. Automatically fetches trending works — no sign-up or VPN required.</p></div>
            <div className="help-fl-item"><h3>One-click Prompt Reuse</h3><p>Click to extract a work&apos;s description as your Studio prompt, starting a new generation round.</p></div>
            <div className="help-fl-item"><h3>Smart Caching</h3><p>Inspiration data is locally persisted (IndexedDB) with 1-hour TTL.</p></div>
          </div>
        </section>

        <section className="help-section">
          <div className="help-section-header">
            <span className="help-section-num">06</span>
            <h2 className="help-section-heading">Archive</h2>
          </div>
          <p className="help-section-intro">
            All your creations — generated videos, images, prompts, and full parameters — are automatically
            archived for instant recall.
          </p>
          <div className="help-feature-list">
            <div className="help-fl-item"><h3>Full History Traceability</h3><p>Each generation records a full snapshot: prompt, model version, resolution, duration, seed, etc.</p></div>
            <div className="help-fl-item"><h3>Quick Reuse</h3><p>Any historical work can be one-click &quot;regenerated&quot; or &quot;sent to editor&quot;.</p></div>
          </div>
        </section>

        <section className="help-section">
          <div className="help-section-header">
            <span className="help-section-num">07</span>
            <h2 className="help-section-heading">Prompt Guide</h2>
          </div>
          <p className="help-section-intro">
            Built-in systematic prompt writing methodology to evolve from &quot;writing something&quot; to
            &quot;precisely controlling generated visuals&quot;.
          </p>
          <div className="help-feature-list">
            <div className="help-fl-item"><h3>Five-element Framework</h3><p>Subject · Action · Scene · Camera · Atmosphere — describe your desired visuals structurally.</p></div>
            <div className="help-fl-item"><h3>Camera Grammar Quick Reference</h3><p>Push, pull, pan, tilt, dolly, crane, orbit — standard notation and effect examples.</p></div>
            <div className="help-fl-item"><h3>Failure Mode Solutions</h3><p>Systematically catalogs common generation defects with diagnostic methods and prompt patch strategies.</p></div>
          </div>
        </section>

        <section className="help-section">
          <div className="help-section-header">
            <span className="help-section-num">⌘</span>
            <h2 className="help-section-heading">Keyboard Shortcuts</h2>
          </div>
          <div className="help-kbd-grid">
            {[
              { keys: "Space", en: "Play / Pause" },
              { keys: "Ctrl+D", en: "Duplicate clip" },
              { keys: "Delete", en: "Delete clip" },
              { keys: "Ctrl+Z", en: "Undo" },
              { keys: "Ctrl+Shift+Z", en: "Redo" },
              { keys: "←  →", en: "Nudge playhead" },
              { keys: "Ctrl+Enter", en: "Submit generation" },
              { keys: "Esc", en: "Deselect / Close panel" },
            ].map((s) => (
              <div key={s.keys} className="help-kbd-row">
                <kbd>{s.keys}</kbd>
                <span>{s.en}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="help-section">
          <div className="help-section-header">
            <span className="help-section-num">▶</span>
            <h2 className="help-section-heading">Getting Started</h2>
          </div>
          <div className="help-steps">
            <div className="help-step"><span className="help-step-num">1</span><div><h3>Configure API Key</h3><p>Click &quot;Unconfigured Key&quot; in the top-right corner and enter your Bailian platform API Key.</p></div></div>
            <div className="help-step"><span className="help-step-num">2</span><div><h3>Choose Mode &amp; Write Prompt</h3><p>Select T2V / I2V / R2V mode (or Image tab) in the right panel. Write your visual description following the five-element framework.</p></div></div>
            <div className="help-step"><span className="help-step-num">3</span><div><h3>Submit Generation</h3><p>Click &quot;Generate ↑&quot; to submit. The left sidebar shows real-time progress.</p></div></div>
            <div className="help-step"><span className="help-step-num">4</span><div><h3>Edit &amp; Export</h3><p>Send satisfying clips to the Editor module, add transitions, color grading, music.</p></div></div>
          </div>
        </section>

        <section className="help-cta">
          <p className="help-cta-text">Ready to start creating?</p>
          <Link href="/en" className="help-cta-btn">Open Studio →</Link>
        </section>
      </main>

      <style>{`
        .help-main { max-width: 880px; margin: 100px auto 80px; padding: 0 28px; }
        .help-hero { text-align: center; margin-bottom: 80px; padding: 48px 0 56px; border-bottom: 1px solid var(--line); }
        .help-eyebrow { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--paper-mute); margin: 0 0 14px; }
        .help-title { font-family: var(--font-serif); font-style: italic; font-weight: 400; font-size: 56px; line-height: 1; margin: 0 0 24px; color: var(--paper); }
        .help-accent { color: var(--accent); }
        .help-subtitle { font-size: 16px; line-height: 1.8; color: var(--paper-dim); max-width: 56ch; margin: 0 auto; }
        .help-section { margin-bottom: 64px; }
        .help-section-header { display: flex; align-items: baseline; gap: 14px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
        .help-section-num { font-family: var(--font-mono); font-size: 12px; color: var(--accent); letter-spacing: 0.1em; }
        .help-section-heading { font-family: var(--font-serif); font-style: italic; font-weight: 400; font-size: 26px; color: var(--paper); margin: 0; }
        .help-section-intro { font-size: 14px; line-height: 1.75; color: var(--paper-dim); margin: 16px 0 24px; max-width: 68ch; }
        .help-feature-list { display: flex; flex-direction: column; gap: 20px; }
        .help-fl-item { padding: 20px 24px; background: var(--ink-2); border: 1px solid var(--line); border-radius: 10px; transition: border-color 0.15s; }
        .help-fl-item:hover { border-color: var(--accent); }
        .help-fl-item h3 { font-family: var(--font-serif); font-style: italic; font-weight: 400; font-size: 16px; color: var(--paper); margin: 0 0 8px; }
        .help-fl-item p { font-size: 13.5px; line-height: 1.7; color: var(--paper-dim); margin: 0; }
        .help-kbd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; margin-top: 16px; }
        .help-kbd-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: var(--ink-2); border: 1px solid var(--line); border-radius: 8px; }
        .help-kbd-row kbd { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.06em; color: var(--accent); background: var(--ink); border: 1px solid var(--line); border-radius: 4px; padding: 3px 8px; white-space: nowrap; }
        .help-kbd-row span { font-size: 13px; color: var(--paper-dim); }
        .help-steps { display: flex; flex-direction: column; gap: 16px; margin-top: 16px; }
        .help-step { display: flex; gap: 16px; padding: 18px 22px; background: var(--ink-2); border: 1px solid var(--line); border-radius: 10px; }
        .help-step-num { font-family: var(--font-mono); font-size: 20px; font-weight: 600; color: var(--accent); line-height: 1; flex-shrink: 0; width: 28px; text-align: center; }
        .help-step h3 { font-family: var(--font-serif); font-style: italic; font-weight: 400; font-size: 15px; color: var(--paper); margin: 0 0 6px; }
        .help-step p { font-size: 13px; line-height: 1.65; color: var(--paper-dim); margin: 0; }
        .help-cta { text-align: center; padding: 48px 0; border-top: 1px solid var(--line); }
        .help-cta-text { font-family: var(--font-serif); font-style: italic; font-size: 22px; color: var(--paper); margin: 0 0 20px; }
        .help-cta-btn { display: inline-block; font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink); background: var(--accent); padding: 12px 28px; border-radius: 6px; text-decoration: none; transition: opacity 0.15s; }
        .help-cta-btn:hover { opacity: 0.85; }
        @media (max-width: 640px) {
          .help-title { font-size: 38px; }
          .help-subtitle { font-size: 14px; }
          .help-section-heading { font-size: 20px; }
          .help-kbd-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
