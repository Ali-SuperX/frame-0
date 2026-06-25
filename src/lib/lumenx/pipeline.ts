/**
 * LumenX LLM 编排层 —— 剧本抽取实体 / 风格推荐 / 分镜拆解。
 * 复用 /api/bailian/chat（与 canvas orchestrate 同后端），输出结构化 JSON。
 */

import type {
  LxCharacter,
  LxScene,
  LxProp,
  LxStyle,
  LxShot,
} from "./types";
import { SHOT_SIZES, CAMERA_MOVES } from "./presets";

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/* ── 公共：调用 LLM + 容错抽 JSON ── */
async function chatJSON(
  system: string,
  user: string,
  temperature = 0.7,
): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  let res: Response;
  try {
    res = await fetch("/api/bailian/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        stream: false,
        temperature,
        enableThinking: false,
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("AI 处理超时（>90s），请重试或精简文本");
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`AI 调用失败:${res.status} ${t.slice(0, 160)}`);
  }
  const json = await res.json();
  const content: string =
    json.choices?.[0]?.message?.content || json.content || "";
  if (!content) throw new Error("AI 返回为空");
  return parseLoose(content);
}

function parseLoose(content: string): Record<string, unknown> {
  let body = content.trim();
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) body = fenced[1].trim();
  const s = body.indexOf("{");
  const e = body.lastIndexOf("}");
  if (s >= 0 && e > s) body = body.slice(s, e + 1);
  try {
    return JSON.parse(body);
  } catch (err) {
    throw new Error(
      `AI 输出非 JSON：${err instanceof Error ? err.message : ""}。前 160 字：${content.slice(0, 160)}`,
    );
  }
}

/* ════════════ ① 剧本 → 实体抽取 ════════════ */

const EXTRACT_SYSTEM = `你是短剧制片的剧本分析师。读用户给的小说/剧本文本，抽出可用于影视化的实体。
要求：
- 角色 characters：姓名用简体中文；description 只写「永久外貌特征」（年龄段、性别、发型、脸型、体型、标志性服装），便于 AI 出图保持一致，不要写情节；gender 填 male/female；voiceTone 用 2-6 个中文词概括性格基调（如"沉稳磁性""活泼少女"）；visualWeight 给 1-5（5=核心主角，3=配角，1=群演）。
- 场景 scenes：name 场景名；description 写环境/光线/氛围（出图用）；timeOfDay 时间（白天/夜晚/黄昏…）；mood 氛围基调。
- 道具 props：关键道具，name + description。
- 给一个 title：6-14 字、有钩子的剧名。
数量克制：角色 ≤6、场景 ≤6、道具 ≤6，只留对画面最重要的。
严格只输出 JSON，无解释：
{"title":"剧名","characters":[{"name":"","description":"","gender":"male","age":"","voiceTone":"","visualWeight":5}],"scenes":[{"name":"","description":"","timeOfDay":"","mood":""}],"props":[{"name":"","description":""}]}`;

export type ExtractResult = {
  title: string;
  characters: LxCharacter[];
  scenes: LxScene[];
  props: LxProp[];
};

export async function extractEntities(sourceText: string): Promise<ExtractResult> {
  const text = sourceText.trim();
  if (!text) throw new Error("请先粘贴剧本或小说文本");
  const parsed = await chatJSON(EXTRACT_SYSTEM, `文本：\n${text.slice(0, 6000)}`);

  const rawChars = Array.isArray(parsed.characters) ? parsed.characters : [];
  const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  const rawProps = Array.isArray(parsed.props) ? parsed.props : [];

  const characters: LxCharacter[] = rawChars.map((r) => {
    const o = r as Record<string, unknown>;
    const gender = String(o.gender || "").toLowerCase();
    return {
      id: uid("char"),
      name: String(o.name || "").trim() || "未命名角色",
      description: String(o.description || "").trim(),
      gender: gender === "male" || gender === "female" ? (gender as "male" | "female") : undefined,
      age: String(o.age || "").trim() || undefined,
      voiceTone: String(o.voiceTone || "").trim() || undefined,
      visualWeight: clampWeight(o.visualWeight),
      variants: [],
      status: "idle",
    };
  });

  const scenes: LxScene[] = rawScenes.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      id: uid("scene"),
      name: String(o.name || "").trim() || "未命名场景",
      description: String(o.description || "").trim(),
      timeOfDay: String(o.timeOfDay || "").trim() || undefined,
      mood: String(o.mood || "").trim() || undefined,
      variants: [],
      status: "idle",
    };
  });

  const props: LxProp[] = rawProps.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      id: uid("prop"),
      name: String(o.name || "").trim() || "未命名道具",
      description: String(o.description || "").trim(),
      variants: [],
      status: "idle",
    };
  });

  if (!characters.length && !scenes.length) throw new Error("没抽到角色/场景，换段更具体的剧情文本试试");

  return {
    title: String(parsed.title || "").trim() || "未命名短剧",
    characters,
    scenes,
    props,
  };
}

function clampWeight(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(5, n));
}

/* ════════════ ② 美术风格 AI 推荐 ════════════ */

const STYLE_SYSTEM = `你是短剧美术指导。读剧本文本，推荐 3 种最契合的视觉风格。
每个风格：name（中文风格名）、description（中文一句话）、reason（≤30 中文字，为何契合本片）、positivePrompt（英文 SD 关键词，只写画风/光线/色调/材质/媒介，禁止写具体角色或情节）、negativePrompt（英文，要规避的）。
严格只输出 JSON：
{"styles":[{"name":"","description":"","reason":"","positivePrompt":"","negativePrompt":""}]}`;

export async function recommendStyles(sourceText: string): Promise<LxStyle[]> {
  const text = sourceText.trim();
  if (!text) throw new Error("请先填剧本文本");
  const parsed = await chatJSON(STYLE_SYSTEM, `文本：\n${text.slice(0, 2000)}`, 0.8);
  const raw = Array.isArray(parsed.styles) ? parsed.styles : [];
  return raw.slice(0, 3).map((r) => {
    const o = r as Record<string, unknown>;
    return {
      id: uid("ai-style"),
      name: String(o.name || "").trim() || "AI 风格",
      description: String(o.description || "").trim(),
      reason: String(o.reason || "").trim() || undefined,
      positivePrompt: String(o.positivePrompt || "").trim(),
      negativePrompt: String(o.negativePrompt || "").trim() || "low quality, deformed, text, watermark",
      isCustom: false,
    };
  }).filter((s) => s.positivePrompt);
}

/* ════════════ ④ 剧本 → 分镜拆解 ════════════ */

const SHOT_SIZE_IDS = SHOT_SIZES.map((s) => s.id);
const CAMERA_IDS = CAMERA_MOVES.map((c) => c.id);

function storyboardSystem(charNames: string[], sceneNames: string[], propNames: string[]): string {
  return `你是专业短剧分镜师。把剧本拆成 6-12 个连贯镜头，每镜一个主要动作（约 3-5 秒画面）。
可引用的角色（用准确名字）：${charNames.join("、") || "（无）"}
可引用的场景：${sceneNames.join("、") || "（无）"}
可引用的道具：${propNames.join("、") || "（无）"}

每个镜头字段：
- scene：该镜所在场景名（从上面场景里选，没有就留空）
- characters：出场角色名数组（从上面角色里选）
- props：本镜出现的关键道具名数组（从上面道具里选，没有就空数组）
- action：中文画面动作描述（一句，谁在做什么、表情情绪）
- shotSize：景别，从 [${SHOT_SIZE_IDS.join(" / ")}] 选一个
- camera：运镜，从 [${CAMERA_IDS.join(" / ")}] 选一个
- imagePrompt：英文画面 prompt（50-110 词，写镜头角度、角色姿态与表情、环境细节、光线色调、构图，禁止中文）。重要：不要描写角色的长相/发型/服装颜色等外貌细节（这些由角色设定与参考图决定，描写会导致跨镜不一致）——用 the man / the woman / 角色名 指代即可，绝不要给角色新加或改变服饰
- dialogue：该镜台词（中文，≤35 字；旁白/无台词则空字符串）
- speaker：说这句台词的角色名（无台词留空）
- durationSec：建议时长 3-6 秒

叙事：首镜立场景，中段推进冲突，末镜留反转或回味。
严格只输出 JSON：
{"shots":[{"scene":"","characters":[""],"props":[],"action":"","shotSize":"中景","camera":"still","imagePrompt":"English...","dialogue":"","speaker":"","durationSec":4}]}`;
}

export async function buildStoryboard(
  sourceText: string,
  characters: LxCharacter[],
  scenes: LxScene[],
  props: LxProp[],
): Promise<LxShot[]> {
  const text = sourceText.trim();
  if (!text) throw new Error("请先填剧本文本");
  const parsed = await chatJSON(
    storyboardSystem(characters.map((c) => c.name), scenes.map((s) => s.name), props.map((p) => p.name)),
    `剧本：\n${text.slice(0, 5000)}`,
    0.75,
  );

  const raw = Array.isArray(parsed.shots) ? parsed.shots : [];
  if (!raw.length) throw new Error("没拆出分镜，换段更完整的剧情试试");

  const charByName = new Map(characters.map((c) => [c.name, c.id]));
  const sceneByName = new Map(scenes.map((s) => [s.name, s.id]));
  const propByName = new Map(props.map((p) => [p.name, p.id]));

  return raw.map((r, i) => {
    const o = r as Record<string, unknown>;
    const charNames = Array.isArray(o.characters) ? o.characters.map(String) : [];
    const characterIds = charNames.map((n) => matchId(n, charByName)).filter(Boolean) as string[];
    const propNamesArr = Array.isArray(o.props) ? o.props.map(String) : [];
    const propIds = propNamesArr.map((n) => matchId(n, propByName)).filter(Boolean) as string[];
    const speakerName = String(o.speaker || "").trim();
    const speakerId = speakerName ? matchId(speakerName, charByName) : undefined;
    const shotSize = SHOT_SIZE_IDS.includes(String(o.shotSize)) ? String(o.shotSize) : "中景";
    const camera = CAMERA_IDS.includes(String(o.camera)) ? String(o.camera) : "still";

    return {
      id: uid("shot"),
      idx: i + 1,
      sceneId: matchId(String(o.scene || "").trim(), sceneByName),
      characterIds,
      propIds,
      action: String(o.action || "").trim(),
      shotSize,
      camera,
      imagePrompt: String(o.imagePrompt || "").trim(),
      dialogue: String(o.dialogue || "").trim() || undefined,
      speakerId: speakerId || undefined,
      durationSec: Math.max(3, Math.min(8, Math.round(Number(o.durationSec) || 4))),
      imageVariants: [],
      status: "idle",
    } as LxShot;
  });
}

/** 名字精确 / 包含匹配到 id。 */
function matchId(name: string, map: Map<string, string>): string | undefined {
  if (!name) return undefined;
  if (map.has(name)) return map.get(name);
  for (const [k, v] of map) {
    if (k.includes(name) || name.includes(k)) return v;
  }
  return undefined;
}

/* ════════════ ⑤ 文本润色 / 扩写 ════════════ */

/** 调 LLM 直接拿纯文本（不走 JSON 解析）。同 chatJSON 的容错/超时口径。 */
async function chatText(
  system: string,
  user: string,
  temperature = 0.7,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  let res: Response;
  try {
    res = await fetch("/api/bailian/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        stream: false,
        temperature,
        enableThinking: false,
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("AI 处理超时（>90s），请重试或精简文本");
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`AI 调用失败:${res.status} ${t.slice(0, 160)}`);
  }
  const json = await res.json();
  const content: string = json.choices?.[0]?.message?.content || json.content || "";
  if (!content) throw new Error("AI 返回为空");
  // 模型偶尔会用 ``` 包整段，剥一下。
  let body = content.trim();
  const fenced = body.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
  if (fenced) body = fenced[1].trim();
  return body;
}

const POLISH_SYSTEM =
  "你是一位资深编剧。请对以下剧本进行润色优化：保持原有故事情节和人物不变，优化语言表达、对白自然度、画面描写细节、节奏感。直接输出润色后的完整剧本文本，不要加任何解释说明。";

const EXPAND_SYSTEM =
  "你是一位资深编剧。请根据以下大纲/简要描述，扩展为一个完整的短剧剧本（2000-4000字），包含：具体场景描写、人物动作、对白。要求情节连贯、人物鲜明、画面感强。直接输出完整剧本文本，不要加任何解释说明。";

/** 润色：保持原意，优化语言表达、对白节奏、画面描写。 */
export async function polishScript(sourceText: string): Promise<string> {
  const text = sourceText.trim();
  if (!text) throw new Error("请先填剧本文本");
  const out = await chatText(POLISH_SYSTEM, text.slice(0, 8000), 0.7);
  if (!out.trim()) throw new Error("AI 润色返回为空，请重试");
  return out;
}

/** 扩写：从大纲/简要描述扩展为完整剧本场景。 */
export async function expandScript(sourceText: string): Promise<string> {
  const text = sourceText.trim();
  if (!text) throw new Error("请先填剧本大纲");
  const out = await chatText(EXPAND_SYSTEM, text.slice(0, 4000), 0.85);
  if (!out.trim()) throw new Error("AI 扩写返回为空，请重试");
  return out;
}
