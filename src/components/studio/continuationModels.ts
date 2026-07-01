import {
  defaultModelForMode,
  getI2VVariant,
  getModel,
  getR2VVariant,
  modelsByMode,
  type Mode,
  type ModelSpec,
} from "@/lib/bailian/models";

type ContinuationMode = "r2v" | "i2v";

const COPY_PARAM_KEYS = [
  "resolution",
  "ratio",
  "size",
  "shot_type",
  "quality_mode",
  "prompt_extend",
  "audio",
  "watermark",
  "audio_setting",
  "seed",
];

const SIZE_BY_RATIO: Record<string, string> = {
  "16:9": "1280*720",
  "9:16": "720*1280",
  "1:1": "960*960",
};

function fieldKeys(spec: ModelSpec): Set<string> {
  return new Set(spec.fields.map((field) => field.key));
}

function requiredMediaKeys(spec: ModelSpec): string[] {
  return spec.fields
    .filter((field) => field.kind === "media" && field.required)
    .map((field) => field.key);
}

function isContinuationModel(spec: ModelSpec, mode: ContinuationMode): boolean {
  if (spec.mode !== mode) return false;
  const required = requiredMediaKeys(spec);
  if (mode === "r2v") return required.every((key) => key === "reference_urls");
  return required.every((key) => key === "img_url");
}

export function continuationModelsForMode(mode: ContinuationMode): ModelSpec[] {
  return modelsByMode(mode).filter((spec) => isContinuationModel(spec, mode));
}

export function defaultContinuationModelId(
  mode: ContinuationMode,
  sourceModelId: string
): string {
  const options = continuationModelsForMode(mode);
  const derived =
    mode === "r2v" ? getR2VVariant(sourceModelId) : getI2VVariant(sourceModelId);
  if (derived && options.some((spec) => spec.id === derived)) return derived;

  const preferred = defaultModelForMode(mode as Mode);
  if (options.some((spec) => spec.id === preferred.id)) return preferred.id;
  return options[0]?.id ?? "";
}

export function continuationParamsFor(
  modelId: string,
  sourceParams: Record<string, unknown>,
  duration: number
): Record<string, unknown> {
  const spec = getModel(modelId);
  if (!spec) return { ...sourceParams, duration };

  const keys = fieldKeys(spec);
  const params: Record<string, unknown> = { ...spec.defaults };

  for (const key of COPY_PARAM_KEYS) {
    if (!keys.has(key) && !(key in spec.defaults)) continue;
    const value = sourceParams[key];
    if (value !== undefined && value !== null && value !== "") params[key] = value;
  }

  if (keys.has("size") && !params.size && typeof sourceParams.ratio === "string") {
    params.size = SIZE_BY_RATIO[sourceParams.ratio] ?? spec.defaults.size;
  }
  if (keys.has("duration") || "duration" in spec.defaults) {
    params.duration = duration;
  }

  return params;
}
