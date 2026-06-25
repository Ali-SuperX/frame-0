"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import {
  useStudioStore,
  type GenSlot,
  type GenStep,
  type Series,
  type StageShot,
} from "@/lib/store";
import {
  getModel,
  modelsByMode,
  type Mode,
  type ModelSpec,
  type ParamField,
} from "@/lib/bailian/models";
import { DEFAULT_TTS_MODEL, TTS_VOICES } from "@/lib/r2v/ttsVoices";
import { ParamFieldInput } from "@/components/studio/ParamField";
import { FlowIcon } from "./FlowIcon";

const CHAT_LLMS = [
  { id: "qwen3.7-max", name: "Qwen 3.7 Max" },
  { id: "qwen3.7-plus", name: "Qwen 3.7 Plus" },
  { id: "qwen3.6-plus", name: "Qwen 3.6 Plus" },
  { id: "qwen3.6-max", name: "Qwen 3.6 Max" },
  { id: "qwen-max", name: "Qwen Max" },
  { id: "qwen-plus", name: "Qwen Plus" },
  { id: "qwen-turbo", name: "Qwen Turbo" },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
];

const STEP_COPY: Record<GenStep, { zh: string; en: string; hint: string }> = {
  script: { zh: "剧本模型", en: "Script model", hint: "控制分镜数量、编剧模型和故事理解深度。" },
  portrait: { zh: "立绘模型", en: "Cast art model", hint: "用于角色立绘、场景概念图和风格锚点。" },
  image: { zh: "逐镜出图", en: "Frame image", hint: "有角色参考时自动走图像编辑，保持人物外观一致。" },
  video: { zh: "图生视频", en: "Video model", hint: "短剧默认用 HappyHorse I2V，单镜可改成参考生视频模型。" },
  voice: { zh: "配音模型", en: "Voice model", hint: "默认跟随角色音色，也可给全剧或单镜指定音色。" },
};

const PRIMARY_KEYS = new Set(["resolution", "ratio", "duration", "size", "quality_mode", "n"]);
const DEFAULT_FIELD_ORDER: Partial<Record<GenStep, string[]>> = {
  portrait: ["resolution", "size", "quality_mode"],
  image: ["resolution", "size", "quality_mode"],
  video: ["duration", "resolution", "size"],
};

type ShotRef = { epId: string; sceneId: string; shot: StageShot };

function cleanSlot(slot: GenSlot): GenSlot {
  const next: GenSlot = {};
  if (slot.modelId) next.modelId = slot.modelId;
  if (slot.params && Object.keys(slot.params).length > 0) next.params = slot.params;
  return next;
}

function defaultModelId(step: GenStep): string {
  if (step === "portrait") return "qwen-image-2.0-pro";
  if (step === "video") return "happyhorse-1.1-i2v";
  if (step === "voice") return DEFAULT_TTS_MODEL;
  return "qwen-image-2.0-pro";
}

function modelsForStep(step: GenStep): ModelSpec[] {
  const uniq = (items: ModelSpec[]) => {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  };
  if (step === "portrait") return uniq(modelsByMode("t2i"));
  if (step === "image") return uniq([...modelsByMode("t2i"), ...modelsByMode("i2i")]);
  if (step === "video") return uniq([...modelsByMode("i2v"), ...modelsByMode("r2v")]);
  return [];
}

function modeForStep(step: GenStep): Mode | null {
  if (step === "portrait") return "t2i";
  if (step === "image") return "t2i";
  if (step === "video") return "i2v";
  return null;
}

function shortModelName(id?: string): string {
  if (!id) return "Auto";
  return getModel(id)?.displayName ?? id;
}

function mainFieldsForStep(step: GenStep, fields: ParamField[], compact: boolean): ParamField[] {
  if (compact) return fields;
  const limit = step === "video" ? 2 : 1;
  const order = DEFAULT_FIELD_ORDER[step] ?? [];
  const ordered = order
    .map((key) => fields.find((field) => field.key === key))
    .filter((field): field is ParamField => !!field);
  const fallback = fields.filter((field) => !ordered.some((item) => item.key === field.key));
  return [...ordered, ...fallback].slice(0, limit);
}

function StageParamInput({
  field,
  value,
  compact,
  onChange,
}: {
  field: ParamField;
  value: unknown;
  compact: boolean;
  onChange: (v: unknown) => void;
}) {
  if (!compact && field.kind === "enum") {
    return (
      <select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  }
  return <ParamFieldInput field={field} value={value} onChange={onChange} />;
}

export default function StageGenControls({
  step,
  shotRef,
  compact = false,
}: {
  step: GenStep;
  shotRef?: ShotRef;
  compact?: boolean;
}) {
  const zh = useLocale() === "zh";
  const series = useStudioStore((s) => s.series);
  const setSeries = useStudioStore((s) => s.setSeries);
  const updateShot = useStudioStore((s) => s.seriesUpdateShot);
  const [scope, setScope] = useState<"series" | "shot">(shotRef ? "shot" : "series");

  const shotSlot = shotRef?.shot.genOverride?.[step];
  const seriesSlot = series.genConfig?.[step];
  const eff = scope === "shot" && shotRef ? shotSlot ?? seriesSlot : seriesSlot;

  function writeSlot(slot: GenSlot) {
    const cleaned = cleanSlot(slot);
    if (scope === "shot" && shotRef) {
      updateShot(shotRef.epId, shotRef.sceneId, shotRef.shot.id, {
        genOverride: { ...shotRef.shot.genOverride, [step]: cleaned },
      });
    } else {
      setSeries({ genConfig: { ...series.genConfig, [step]: cleaned } });
    }
  }

  function writeParams(params: Record<string, unknown>) {
    writeSlot({ modelId: eff?.modelId, params });
  }

  const scopeToggle = shotRef ? (
    <div className="sf-gc-scope" role="tablist">
      <button className={scope === "series" ? "on" : ""} onClick={() => setScope("series")}>
        {zh ? "全剧" : "Series"}
      </button>
      <button className={scope === "shot" ? "on" : ""} onClick={() => setScope("shot")}>
        {zh ? "本镜" : "Shot"}
      </button>
    </div>
  ) : null;

  if (step === "script") {
    const params = eff?.params ?? {};
    const modelId = eff?.modelId ?? "qwen3.6-plus";
    const beats = Number(params.numBeats ?? (series.kind === "comic" ? 6 : 8));
    return (
      <section className={`sf-gc${compact ? " compact" : ""}`}>
        <Header step={step} series={series} />
        <div className="sf-gc-grid">
          <label className="sf-gc-row">
            <span>{zh ? "编剧模型" : "Writer"}</span>
            <select value={modelId} onChange={(e) => writeSlot({ modelId: e.target.value, params })}>
              {CHAT_LLMS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="sf-gc-row">
            <span>{zh ? "分镜数" : "Beats"}</span>
            <div className="sf-gc-range">
              <input
                type="range"
                min={4}
                max={14}
                step={1}
                value={beats}
                onChange={(e) => writeParams({ ...params, numBeats: Number(e.target.value) })}
              />
              <b>{beats}</b>
            </div>
          </label>
        </div>
      </section>
    );
  }

  if (step === "voice") {
    const params = eff?.params ?? {};
    const voice = typeof params.voice === "string" ? params.voice : "";
    return (
      <section className={`sf-gc${compact ? " compact" : ""}`}>
        <Header step={step} series={series} />
        <div className="sf-gc-grid">
          <label className="sf-gc-row">
            <span>{zh ? "TTS 模型" : "TTS model"}</span>
            <select
              value={eff?.modelId ?? DEFAULT_TTS_MODEL}
              onChange={(e) => writeSlot({ modelId: e.target.value, params })}
            >
              <option value={DEFAULT_TTS_MODEL}>Qwen3 TTS Flash</option>
            </select>
          </label>
          <label className="sf-gc-row">
            <span>{zh ? "音色" : "Voice"}</span>
            <select value={voice} onChange={(e) => writeParams({ ...params, voice: e.target.value || undefined })}>
              <option value="">{zh ? "跟随角色音色" : "Per character"}</option>
              {TTS_VOICES.filter((v) => v.group === "qwen3").map((v) => (
                <option key={v.id} value={v.id}>{v.zh} · {v.desc}</option>
              ))}
            </select>
          </label>
        </div>
        {scopeToggle}
      </section>
    );
  }

  const models = modelsForStep(step);
  const params = eff?.params ?? {};
  const modelId = eff?.modelId ?? "";
  const effectiveModelId = modelId || defaultModelId(step);
  const spec = getModel(effectiveModelId) ?? getModel(defaultModelId(step));
  const mergedParams = { ...spec?.defaults, ...params } as Record<string, unknown>;
  const allFields = (spec?.fields ?? []).filter((f) => f.kind !== "media" && f.key !== "prompt");
  const primaryFields = allFields.filter((f) => PRIMARY_KEYS.has(f.key));
  const mainFields = mainFieldsForStep(step, primaryFields, compact);
  const mainFieldKeys = new Set(mainFields.map((field) => field.key));
  const advancedFields = [
    ...primaryFields.filter((field) => !mainFieldKeys.has(field.key)),
    ...allFields.filter((field) => !PRIMARY_KEYS.has(field.key)),
  ];
  const allowAuto = step === "image" || step === "video";
  const mode = modeForStep(step);

  return (
    <section className={`sf-gc${compact ? " compact" : ""}`}>
      <Header step={step} series={series} />
      <div className="sf-gc-grid">
        <label className="sf-gc-row full">
          <span>{zh ? "模型" : "Model"}</span>
          <select
            value={allowAuto ? modelId : effectiveModelId}
            onChange={(e) => writeSlot({ modelId: e.target.value || undefined, params: {} })}
          >
            {allowAuto && (
              <option value="">
                {step === "image"
                  ? (zh ? "智能选择：参考图优先 Qwen Image Edit" : "Auto: refs use Qwen Image Edit")
                  : (zh ? "智能选择：HappyHorse I2V" : "Auto: HappyHorse I2V")}
              </option>
            )}
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.displayName}</option>
            ))}
          </select>
        </label>
        {mainFields.map((field) => (
          <div key={field.key} className="sf-gc-row">
            <span>{field.label}</span>
            <StageParamInput
              field={field}
              value={mergedParams[field.key]}
              compact={compact}
              onChange={(v) => writeParams({ ...params, [field.key]: v })}
            />
          </div>
        ))}
      </div>
      {advancedFields.length > 0 && (
        <details className="sf-gc-advanced">
          <summary><FlowIcon n="target" s={12} />{zh ? "高级参数" : "Advanced"}</summary>
          <div className="sf-gc-grid">
            {advancedFields.map((field) => (
              <div key={field.key} className="sf-gc-row">
                <span>{field.label}</span>
                <StageParamInput
                  field={field}
                  value={mergedParams[field.key]}
                  compact={compact}
                  onChange={(v) => writeParams({ ...params, [field.key]: v })}
                />
              </div>
            ))}
          </div>
        </details>
      )}
      <div className="sf-gc-foot">
        <span>{mode ? `${mode.toUpperCase()} · ${shortModelName(eff?.modelId)}` : shortModelName(eff?.modelId)}</span>
        {scopeToggle}
      </div>
    </section>
  );
}

function Header({ step, series }: { step: GenStep; series: Series }) {
  const zh = useLocale() === "zh";
  const copy = STEP_COPY[step];
  return (
    <div className="sf-gc-head">
      <div>
        <div className="sf-gc-title">{zh ? copy.zh : copy.en}</div>
        <div className="sf-gc-hint">{copy.hint}</div>
      </div>
      <span className="sf-gc-pill">{series.aspect}</span>
    </div>
  );
}
