"use client";

import type { Stage } from "@/lib/r2v/projectStore";

type StepStatus = "done" | "current" | "locked" | "ready";

type Props = {
  stage: Stage;
  /** Whether each later stage has the prerequisites it needs. */
  card1Ready: boolean;
  card2Ready: boolean;
  card3Ready: boolean;
  zh: boolean;
  onJump: (stage: Stage) => void;
};

type Step = {
  n: Stage;
  zh: { title: string; sub: string };
  en: { title: string; sub: string };
};

const STEPS: Step[] = [
  {
    n: 1,
    zh: { title: "结构化输入", sub: "上传图片 + 5 要素 + 风格" },
    en: { title: "Inputs", sub: "Images + 5 elements + style" },
  },
  {
    n: 2,
    zh: { title: "Prompt", sub: "AI 扩写 / 手动粘贴" },
    en: { title: "Prompt", sub: "AI expand / manual paste" },
  },
  {
    n: 3,
    zh: { title: "视频", sub: "AI 生成 / 历史" },
    en: { title: "Video", sub: "AI generate / history" },
  },
];

function statusOf(
  step: Stage,
  current: Stage,
  ready: { c1: boolean; c2: boolean; c3: boolean }
): StepStatus {
  if (step === current) return "current";
  if (step < current) return "done";
  // step > current → locked unless prereqs ready
  if (step === 2 && ready.c1) return "ready";
  if (step === 3 && ready.c2) return "ready";
  return "locked";
}

export default function ProjectStepper({
  stage,
  card1Ready,
  card2Ready,
  card3Ready,
  zh,
  onJump,
}: Props) {
  const ready = { c1: card1Ready, c2: card2Ready, c3: card3Ready };
  return (
    <div className="r2v-stepper" role="tablist" aria-label="R2V Workflow Stages">
      {STEPS.map((s, i) => {
        const st = statusOf(s.n, stage, ready);
        const meta = zh ? s.zh : s.en;
        const clickable = st !== "locked";
        const stageReady =
          (s.n === 1 && card1Ready) ||
          (s.n === 2 && card2Ready) ||
          (s.n === 3 && card3Ready);
        return (
          <div key={s.n} className="r2v-stepper-row">
            <button
              type="button"
              role="tab"
              aria-selected={st === "current"}
              disabled={!clickable}
              onClick={() => clickable && onJump(s.n)}
              className={`r2v-step r2v-step--${st}`}
              title={meta.sub}
            >
              <span className="r2v-step-circle" aria-hidden>
                {st === "done" ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M2.5 7.5L6 11L11.5 4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  s.n
                )}
              </span>
              <span className="r2v-step-meta">
                <span className="r2v-step-title">{meta.title}</span>
                <span className="r2v-step-sub">{meta.sub}</span>
              </span>
              {stageReady && st !== "current" ? (
                <span className="r2v-step-pulse" aria-hidden />
              ) : null}
            </button>
            {i < STEPS.length - 1 ? (
              <span
                className={`r2v-step-link r2v-step-link--${
                  stage > s.n ? "filled" : "empty"
                }`}
                aria-hidden
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
