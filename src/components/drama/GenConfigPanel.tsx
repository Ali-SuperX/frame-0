"use client";

// 生成配置面板:出图/视频选模型+调参数,配音选音色。
// 作用范围可切「全剧默认(series.genConfig)」或「仅本镜(shot.genOverride)」。
// 生效优先级(见 DramaCanvas handleGenerate):单镜覆盖 > 全剧默认 > stageGen 内置默认。

import { useState } from "react";
import { useLocale } from "next-intl";
import { useStudioStore, type GenStep, type GenSlot, type Series } from "@/lib/store";
import { modelsByMode, getModel, defaultModelForMode, type Mode } from "@/lib/bailian/models";
import { TTS_VOICES } from "@/lib/r2v/ttsVoices";
import { ParamFieldInput } from "../studio/ParamField";

const STEP_MODE: Record<"image" | "video", Mode> = { image: "t2i", video: "i2v" };
// 只暴露关键参数,避免面板过长(完整参数仍可在工坊调)
const PRIMARY_KEYS = new Set(["resolution", "ratio", "duration", "size", "quality_mode", "n"]);

function locate(series: Series, shotId: string) {
  for (const ep of series.episodes)
    for (const sc of ep.scenes)
      for (const s of sc.shots)
        if (s.id === shotId) return { shot: s, epId: ep.id, sceneId: sc.id };
  return null;
}

export default function GenConfigPanel({ step, shotId }: { step: GenStep; shotId: string }) {
  const zh = useLocale() === "zh";
  const series = useStudioStore((s) => s.series);
  const setSeries = useStudioStore((s) => s.setSeries);
  const seriesUpdateShot = useStudioStore((s) => s.seriesUpdateShot);
  const [scope, setScope] = useState<"series" | "shot">("series");

  const loc = locate(series, shotId);
  if (!loc) return null;
  const { shot, epId, sceneId } = loc;

  const eff = shot.genOverride?.[step] ?? series.genConfig?.[step];

  const writeSlot = (slot: GenSlot) => {
    if (scope === "series") {
      setSeries({ genConfig: { ...series.genConfig, [step]: slot } });
    } else {
      seriesUpdateShot(epId, sceneId, shotId, { genOverride: { ...shot.genOverride, [step]: slot } });
    }
  };

  const scopeToggle = (
    <div className="drama-cfg-scope">
      {(["series", "shot"] as const).map((sc) => (
        <button
          key={sc}
          className={`drama-cfg-scope-btn${scope === sc ? " on" : ""}`}
          onClick={() => setScope(sc)}
        >
          {sc === "series" ? (zh ? "全剧默认" : "All shots") : (zh ? "仅本镜" : "This shot")}
        </button>
      ))}
    </div>
  );

  // ── 配音:音色选择(TTS 不在 models.ts 的 mode 体系)──
  if (step === "voice") {
    const curVoice = (eff?.params?.voice as string) ?? "";
    return (
      <div className="drama-gen-config">
        <div className="drama-cfg-row">
          <span className="drama-cfg-label">{zh ? "音色" : "Voice"}</span>
          <select
            className="drama-cfg-select"
            value={curVoice}
            onChange={(e) => writeSlot({ params: { ...eff?.params, voice: e.target.value } })}
          >
            <option value="">{zh ? "跟随角色" : "Per character"}</option>
            {TTS_VOICES.filter((v) => v.group === "qwen3").map((v) => (
              <option key={v.id} value={v.id}>
                {v.zh} · {v.desc}
              </option>
            ))}
          </select>
        </div>
        {scopeToggle}
      </div>
    );
  }

  // ── 出图 / 视频:模型 + 关键参数 ──
  const mode = STEP_MODE[step as "image" | "video"] ?? "t2i";
  const models = modelsByMode(mode);
  const curModelId = eff?.modelId ?? defaultModelForMode(mode).id;
  const spec = getModel(curModelId);
  const params = { ...spec?.defaults, ...eff?.params } as Record<string, unknown>;
  const fields = (spec?.fields ?? []).filter((f) => f.kind !== "media" && PRIMARY_KEYS.has(f.key));

  return (
    <div className="drama-gen-config">
      <div className="drama-cfg-row">
        <span className="drama-cfg-label">{zh ? "模型" : "Model"}</span>
        <select
          className="drama-cfg-select"
          value={curModelId}
          onChange={(e) => writeSlot({ modelId: e.target.value, params: {} })}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
      </div>
      {fields.map((f) => (
        <div key={f.key} className="drama-cfg-row">
          <span className="drama-cfg-label">{f.label}</span>
          <div className="drama-cfg-field">
            <ParamFieldInput
              field={f}
              value={params[f.key]}
              onChange={(v) => writeSlot({ modelId: curModelId, params: { ...eff?.params, [f.key]: v } })}
            />
          </div>
        </div>
      ))}
      {scopeToggle}
    </div>
  );
}
