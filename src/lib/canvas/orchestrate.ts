/**
 * Canvas AI 编排 —— 一句话需求 → LLM 产出"创作节点图"(节点 + 连线)。
 * 复用 /api/bailian/chat（与 stage aiWriter 同一后端），输出结构化 JSON，
 * 由 Canvas 落成真实节点 + 边 + 自动布局。
 *
 * 短剧「自定义分步」：剧本 → 分镜 → 角色场景 三步可独立调用，用户在每步介入、
 * 改输入也改输出；orchestrateGraph 保留为「一键到底」一次性产整图。
 */

export type OrchMode = "creative" | "drama";

export type OrchestratedNode = {
  ref: string;
  kind: "note" | "character" | "scene" | "prop" | "generate";
  title: string;
  text: string;
  /** 短剧模式：镜头类型 */
  shotType?: string;
  /** 短剧模式：英文画面 prompt（直灌 draft.prompt，可直接出图） */
  imagePrompt?: string;
  /** 短剧模式：推荐时长(秒) */
  durationSec?: number;
  /** 短剧模式：台词（"角色名：台词"格式） */
  dialogue?: string;
  /** 短剧模式·character：性别（配音选音色用） */
  gender?: "male" | "female";
  /** 短剧模式·character：性格基调（中文，配音选音色用） */
  voiceTone?: string;
  /** 专业分镜：逐秒子镜头调度（画面动作、镜头语言、对白安排） */
  segmentPlan?: string;
  /** 照抄剧本原文（不改写不翻译） */
  description?: string;
  /** 该段引用的所有实体名称数组（角色+场景+道具） */
  entities?: string[];
};

export type OrchestratedGraph = {
  nodes: OrchestratedNode[];
  edges: [string, string][];
};

/* ── 公共：调用编排 LLM + 容错抽取 JSON ── */
/** 用户点「终止」时 Canvas 设入当前流程的 signal；callOrchestrator 会一并中止本次请求。
 *  编排一次只跑一个流程（orchBusy/dockBusy/running 互斥），故模块级单值足够，无并发串扰。 */
let activeOrchestratorSignal: AbortSignal | undefined;
export function setOrchestratorSignal(s?: AbortSignal) { activeOrchestratorSignal = s; }

async function callOrchestrator(
  systemPrompt: string,
  userContent: string,
  temperature = 0.85,
  model?: string
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  // 用户点「终止」→ 一并中止本次 fetch（外部 signal 与内部超时共用一个 controller）
  const ext = activeOrchestratorSignal;
  const onExtAbort = () => ctrl.abort();
  if (ext) { if (ext.aborted) ctrl.abort(); else ext.addEventListener("abort", onExtAbort); }
  let res: Response;
  try {
    res = await fetch("/api/bailian/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        stream: false,
        temperature,
        enableThinking: false,
        ...(model ? { model } : {}),
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error(ext?.aborted ? "已终止" : "编排超时（>90s），请重试或简化需求");
    throw e;
  } finally {
    clearTimeout(timer);
    if (ext) ext.removeEventListener("abort", onExtAbort);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`LLM 调用失败:${res.status} ${t.slice(0, 160)}`);
  }
  const json = await res.json();
  const content: string = json.choices?.[0]?.message?.content || json.content || "";
  if (!content) throw new Error("LLM 返回为空");
  return content;
}

/** 容忍 ```json``` 包裹与前后噪音，截出 { ... } 主体。 */
function extractJSONObject(content: string): string {
  let body = content.trim();
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) body = fenced[1].trim();
  const s = body.indexOf("{");
  const e = body.lastIndexOf("}");
  if (s >= 0 && e > s) body = body.slice(s, e + 1);
  return body;
}

function parseOrThrow(content: string): Record<string, unknown> {
  try {
    return JSON.parse(extractJSONObject(content));
  } catch (err) {
    throw new Error(
      `LLM 输出非 JSON：${err instanceof Error ? err.message : ""}。前 160 字：${content.slice(0, 160)}`
    );
  }
}

const SHOT_TYPES = new Set(["still", "zoom-in", "zoom-out", "pan-lr", "live", "ots", "pov", "dutch", "hero", "follow", "whip", "handheld", "low-angle", "aerial"]);
const NODE_KINDS = new Set(["note", "character", "scene", "generate"]);

/** 把 LLM 原始节点对象规范成 OrchestratedNode（含短剧分镜字段兜底）。 */
function normalizeNode(raw: unknown, i: number, mode: OrchMode): OrchestratedNode {
  const r = raw as Record<string, unknown>;
  const kind = String(r.kind || "").trim();
  const node: OrchestratedNode = {
    ref: String(r.ref || `n${i}`).trim(),
    kind: (NODE_KINDS.has(kind) ? kind : "note") as OrchestratedNode["kind"],
    title: String(r.title || "").trim() || `节点${i + 1}`,
    text: String(r.text || "").trim(),
  };
  if (node.kind === "generate" && mode === "drama") {
    const rawShot = String(r.shotType || "").trim().toLowerCase();
    node.shotType = SHOT_TYPES.has(rawShot) ? rawShot : "still";
    node.imagePrompt = String(r.imagePrompt || "").trim() || undefined;
    node.durationSec = Math.max(4, Math.min(15, Number(r.durationSec) || 8));
    node.dialogue = String(r.dialogue || r.text || "").trim() || undefined;
    node.segmentPlan = String(r.segmentPlan || "").trim() || undefined;
    node.description = String(r.description || "").trim() || undefined;
    node.entities = Array.isArray(r.entities) ? r.entities.map(String) : undefined;
  } else if (node.kind === "generate") {
    if (r.shotType) node.shotType = String(r.shotType).trim();
    if (r.imagePrompt) node.imagePrompt = String(r.imagePrompt).trim();
    if (r.durationSec) node.durationSec = Math.max(3, Math.min(15, Number(r.durationSec) || 5));
    if (r.dialogue) node.dialogue = String(r.dialogue).trim();
  }
  return node;
}

const CREATIVE_SYSTEM = `你是 AI 影视创作的"编排助手"。用户给一句话需求，你把它拆成一张可执行的创作节点图，用 JSON 表达。

节点类型 kind：
- note：整体创意 / 剧本梗概（1 个）
- character：主要角色（1-3 个），text 写外貌气质服装等可出图的视觉描述
- scene：核心场景（1-2 个），text 写环境光线氛围
- generate：分镜镜头（3-6 个），text 写这一镜的画面 prompt（含镜头语言）

连线 edges：把相关的 character / scene 连到它出现的 generate 镜头（[来源ref, 目标ref]），让镜头能引用角色立绘 / 场景图保持一致性。note 不连。

严格只输出 JSON，无任何解释，格式：
{"nodes":[{"ref":"c1","kind":"character","title":"角色名","text":"视觉描述"},{"ref":"s1","kind":"scene","title":"场景名","text":"环境描述"},{"ref":"g1","kind":"generate","title":"镜头1","text":"画面prompt"}],"edges":[["c1","g1"],["s1","g1"]]}`;

const DRAMA_SYSTEM = `你是一位专业短剧编排师。用户给一句话短剧需求，你把它拆成一张完整的短剧生产节点图，用 JSON 表达。

节点类型 kind：
- note：剧情梗概（1 个），text 写故事大纲和核心冲突
- character：主要角色（1-3 个），text 写详细外貌描述（年龄、发型、服装、气质），可直接用于 AI 出图
- scene：核心场景（1-2 个），text 写具体环境描述（时间、光线、氛围、道具），可直接用于 AI 出图
- generate：分镜镜头（6-10 个），每个镜头需完整填写以下字段

generate 节点必须包含：
- title：镜头编号+简述（如"镜头1·雨夜入场"）
- text：这一拍的中文台词或旁白（1-2 句，不超过 35 字）
- shotType：镜头类型，从以下选一个：still(静) | zoom-in(特写) | zoom-out(揭示) | pan-lr(横移) | live(视频) | ots(过肩) | pov(主观) | dutch(斜角) | hero(英雄镜)
- imagePrompt：中文画面描述（40-80 字，必须包含：镜头角度、角色姿态与表情、环境细节、光线色调、构图方式）
- durationSec：推荐时长（2-6 秒）
- dialogue：台词（格式"角色名：台词"，旁白则写"旁白：xxx"。每条 ≤35 字）

连线 edges：character/scene 连到它出现的 generate 镜头（[来源ref, 目标ref]），让镜头引用角色/场景保持一致。note 不连。

叙事要求：第一镜立场景，中间推进冲突，最后一镜留下回味或反转。节奏紧凑，每拍 2-4 秒。

严格只输出 JSON，无任何解释，格式：
{"nodes":[{"ref":"n1","kind":"note","title":"剧情","text":"大纲"},{"ref":"c1","kind":"character","title":"角色名","text":"视觉描述"},{"ref":"s1","kind":"scene","title":"场景名","text":"环境描述"},{"ref":"g1","kind":"generate","title":"镜头1·开场","text":"台词","shotType":"live","imagePrompt":"中文画面描述","durationSec":3,"dialogue":"角色：台词"}],"edges":[["c1","g1"],["s1","g1"]]}`;

/* ── 一键到底：一次性产整张图（短剧/创意），保留作快速兜底 ── */
export async function orchestrateGraph(brief: string, mode: OrchMode = "creative", model?: string): Promise<OrchestratedGraph> {
  const content = await callOrchestrator(mode === "drama" ? DRAMA_SYSTEM : CREATIVE_SYSTEM, `需求：${brief}`, 0.85, model);
  const parsed = parseOrThrow(content) as { nodes?: unknown[]; edges?: unknown[] };

  const nodes: OrchestratedNode[] = (Array.isArray(parsed.nodes) ? parsed.nodes : [])
    .map((raw, i) => normalizeNode(raw, i, mode))
    .filter((n) => n.title || n.text);

  if (!nodes.length) throw new Error("LLM 没有产出节点");

  const refs = new Set(nodes.map((n) => n.ref));
  const edges: [string, string][] = (Array.isArray(parsed.edges) ? parsed.edges : [])
    .map((raw) => {
      const arr = raw as unknown[];
      return [String(arr?.[0] ?? ""), String(arr?.[1] ?? "")] as [string, string];
    })
    .filter(([a, b]) => a && b && a !== b && refs.has(a) && refs.has(b));

  return { nodes, edges };
}

/* ════════════ 短剧「自定义分步」：三步可独立调用 ════════════ */

const SCRIPT_SYSTEM = `你是短剧编剧。用户给一句话需求，你扩写成一份可拍摄的「剧本梗概」。
- title：剧名（6-14 字，带钩子）
- logline：一句话卖点（≤30 字）
- synopsis：故事大纲（120-220 字，包含 开场钩子 → 冲突升级 → 反转/高潮 → 收尾；点明主角动机与核心矛盾，有画面感）
只写梗概，不要分镜、不要台词表。
严格只输出 JSON，无任何解释：{"title":"剧名","logline":"一句话卖点","synopsis":"故事大纲"}`;

const SHOTS_SYSTEM = `你是世界级短剧分镜师。给你一份剧本梗概，按以下专业规范拆成连贯的分镜段落（segment）。

一、核心原则：优先合并，不要优先拆开
- 同角色同场景的连续动作链 → 合并为一段
- 从铺垫到落点的完整情绪弧 → 不切断
- 同场景连续问答（哪怕换人说话）→ 保住完整回合
- 只有超过 15 秒硬上限、或对白密度明显超载时才切
- 切点优先级：场景切换 > 情绪落点后 > 完整对白结束后 > 动作链结束后

二、时长规则
- duration 必须是 4~15 之间的整数
- 剧本里的时间码、场次标记、镜头编号一律忽略，不作为切点

三、对白时长计算
- 台词字数 ÷ 3 ≈ 说话秒数
- 每句前后留 1-2 秒反应间隔
- 对白总占用 ≤ 60% segment 时长，超过就拆

四、segment_plan 格式（核心字段）
每行一个子镜头，格式：X-Ys [景别]，画面内容
- 第一个子镜头必须写 [@场景名] 锚定场景
- 角色用 [@角色名] 引用，禁止描写角色外貌服装（靠参考图保持一致）
- 景别从 [远景/全景/中远景/中景/近景/特写] 选，85%落在中景/近景/特写，15%用远景/全景
- 不堆形容词，不写说明书式废话

五、画面符号系统
- 音乐：（舒缓的钢琴曲）
- 音效：<远处传来狗叫声>
- 台词：[@角色名]说：{台词原文}
- 字幕：【第一章：雨夜开账】

六、长对白镜头策略
大段对话时子镜头之间主动切换景别和机位：
- 正反打：对话双方交替给单人近景/中景
- 过肩镜头：从说话者肩膀后方拍对方
- 反应镜头：关键台词后切到听者表情（留1-2秒）
- 特写插入：手部动作、关键道具，打破单调

七、输出格式
每个 segment 必须包含：
- title：段号+简述（如"段1·雨夜邂逅"）
- segmentPlan：逐秒子镜头调度文本（核心，按格式写）
- description：照抄该段对应的剧本原文（不改写不翻译）
- dialogue：该段台词（格式"角色名：台词"）
- entities：所有出现的实体名称数组（角色+场景，必须包含至少一个场景）
- durationSec：总时长（4-15秒整数）
- shotType：主运镜类型，从 still|zoom-in|zoom-out|pan-lr|live|ots|pov|dutch|hero|follow|whip|handheld|low-angle|aerial 选

segmentPlan 示例：
0-4s [中景]，[@雨夜街头] [@男主]撑伞独行，雨滴打在伞面 <雨声>
4-7s [近景]，[@女主]从侧面跑入画面，差点撞到[@男主]（紧张的弦乐）
7-10s [特写]，两人四目相对，[@男主]说：{你没带伞？}

严格只输出 JSON，无任何解释：
{"segments":[{"title":"段1·开场","segmentPlan":"0-4s [中景]，[@场景] [@角色]动作描述\n4-7s [近景]，描述","description":"剧本原文","dialogue":"角色：台词","entities":["角色名","场景名"],"durationSec":10,"shotType":"follow"}]}`;

const ASSETS_SYSTEM = `你是短剧美术指导。给你剧本梗概和分镜表，提炼需保持一致性的「角色」「场景」「道具」资产，并标注每个资产出现在哪些镜号。
- character：主要角色（1-3 个），按戏份主次排列（出场最多/最早的排第一，决定 character1/character2 稳定映射）。text 用固定中文锚格式，每镜复用同一串保证一致性，供出图与 r2v 多参考：'姓名：X，年龄：Y，发型：颜色+样式，服装：颜色+款式，肤色：色调，瞳色：形状+颜色，特征：辨识点'。另给 gender（male/female）与 voiceTone（中文性格基调，如"沉稳威严的中年反派""温柔治愈的少女""阳光热血的少年"，供配音按角色挑音色）
- scene：核心场景（1-2 个），text 写具体环境（时间、光线、氛围）
- prop：关键道具（0-2 个，剧情核心物件，如信物/凶器/手机/监控屏；非必需可不给），text 写外观、材质、特征
- appearsIn：该资产出现的镜号数组（对应分镜表序号，从 1 开始）
严格只输出 JSON，无任何解释：{"assets":[{"kind":"character","title":"角色名","text":"姓名：林晓雨，年龄：28，发型：黑色短波波头，服装：米色风衣，肤色：白皙，瞳色：杏眼棕色，特征：右眼角小痣","gender":"female","voiceTone":"知性沉稳的都市女性","appearsIn":[1,3]},{"kind":"scene","title":"场景名","text":"环境描述","appearsIn":[1,2]},{"kind":"prop","title":"道具名","text":"外观描述","appearsIn":[2]}]}`;

export type ScriptResult = { title: string; logline: string; synopsis: string };

/** 分步①剧本：一句话 → 剧本梗概（轻量、秒回、可改）。 */
export async function orchestrateScript(brief: string, model?: string): Promise<ScriptResult> {
  const content = await callOrchestrator(SCRIPT_SYSTEM, `需求：${brief}`, 0.9, model);
  const parsed = parseOrThrow(content);
  const title = String(parsed.title || "").trim() || "无题短剧";
  const logline = String(parsed.logline || "").trim();
  const synopsis = String(parsed.synopsis || parsed.text || "").trim();
  if (!synopsis) throw new Error("没产出剧本梗概");
  return { title, logline, synopsis };
}

/** 改写 / 扩写剧本：当前剧本 + 指令(+风格) → 新剧本正文（供画布剧本节点的「AI 改写」）。 */
export async function rewriteScript(current: string, instruction: string, style?: string, model?: string): Promise<string> {
  const sys = `你是短剧编剧。根据用户指令改写或扩写给定的剧本梗概，保留可拍摄的画面感与核心冲突。${style ? `整体风格：${style}。` : ""}只输出改写后的剧本正文（可保留【一句话卖点】+ 大纲结构），不要任何解释、不要前后缀。`;
  const user = `当前剧本：\n${current || "(空白，请据指令创作)"}\n\n改写指令：${instruction || "润色并增强戏剧张力"}`;
  const content = await callOrchestrator(sys, user, 0.9, model);
  return content.trim().replace(/^```[a-z]*\n?|\n?```$/g, "").trim();
}

/** 续写下一集：上一集梗概 + 全剧班底(角色/场景名) + 可选方向 → 承接剧情的新一集剧本梗概。
 *  共用一套班底：要求复用已有角色/场景、保持人设关系、不复述上一集。 */
export async function orchestrateNextEpisode(prevSynopsis: string, cast: string[], brief?: string, model?: string): Promise<ScriptResult> {
  const castLine = cast.length
    ? `【沿用班底】必须复用已有角色/场景（人设、关系、外形保持不变）：${cast.join("、")}。可引入少量新角色，但主班底沿用。`
    : "";
  const sys = `${SCRIPT_SYSTEM}\n\n【这是同一部短剧的下一集】承接上一集的人物关系与未了悬念，写一集全新剧情，不要复述上一集。${castLine}标题体现承接关系（如「原名 · 下一章」）。`;
  const user = `上一集梗概：\n${prevSynopsis || "(无)"}\n\n下一集方向：${brief?.trim() || "顺着上一集结尾自然推进，制造新的冲突与反转"}`;
  const content = await callOrchestrator(sys, user, 0.9, model);
  const parsed = parseOrThrow(content);
  const title = String(parsed.title || "").trim() || "下一集";
  const logline = String(parsed.logline || "").trim();
  const synopsis = String(parsed.synopsis || parsed.text || "").trim();
  if (!synopsis) throw new Error("没产出下一集剧本");
  return { title, logline, synopsis };
}

/** 改写单个分镜的画面提示词：当前 segmentPlan + 指令 → 新 segmentPlan（保持逐秒结构与 [@角色] 锚点，只融入改动）。供对话框「第N镜改成…」用。 */
export async function rewriteShotImagePrompt(current: string, instruction: string, model?: string): Promise<string> {
  const sys = `你是 AI 短剧分镜的画面调度师。改写给定的中文逐秒分镜画面（segmentPlan，格式如"0-4s [景别]，[@场景][@角色]动作 <音效>（音乐）"）：严格保持「时间码 + [景别] + 画面内容」的逐秒结构、以及原有的 [@场景]/[@角色] 锚点不变，只按用户指令融入要改的部分（如换时间/天气/景别/情绪/动作）。只输出改写后的中文 segmentPlan，不要任何解释、不要英文。`;
  const user = `当前画面：\n${current || "(空)"}\n\n改动要求：${instruction}`;
  const content = await callOrchestrator(sys, user, 0.7, model);
  return content.trim().replace(/^```[a-z]*\n?|\n?```$/g, "").trim();
}

/** 分步②分镜：剧本梗概 → N 个分镜（generate 节点）。 */
/** shotCount > 0：拆成指定镜数；shotCount <= 0：交给模型根据剧本自行判断该拆多少镜（AI 自动）。 */
export async function orchestrateShots(synopsis: string, shotCount = 10, model?: string): Promise<OrchestratedNode[]> {
  const countInstruction = shotCount > 0
    ? `请拆成 ${shotCount} 个分镜。`
    : `请你根据剧本的情节密度、节奏与总时长，自行判断该拆成多少个分镜（通常 5–15 个；以叙事完整、节奏合理为准，不要凑数也不要硬合并）。`;
  const content = await callOrchestrator(SHOTS_SYSTEM, `剧本梗概：\n${synopsis}\n\n${countInstruction}`, 0.85, model);
  const parsed = parseOrThrow(content) as { segments?: unknown[]; shots?: unknown[]; nodes?: unknown[] };
  const arr = Array.isArray(parsed.segments) ? parsed.segments : Array.isArray(parsed.shots) ? parsed.shots : Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const shots = arr
    .map((raw, i) => {
      const r = raw as Record<string, unknown>;
      return normalizeNode({ ...r, kind: "generate", ref: r.ref || `g${i + 1}` }, i, "drama");
    })
    .filter((n) => n.title || n.imagePrompt || n.text);
  if (!shots.length) throw new Error("没产出分镜");
  return shots;
}

export type AssetSpec = { node: OrchestratedNode; appearsIn: number[] };

/** 分步③角色场景：剧本+分镜 → 资产(character/scene) + 出现镜号(从 1 起)。 */
export async function orchestrateAssets(synopsis: string, shotTitles: string[], model?: string): Promise<AssetSpec[]> {
  const shotList = shotTitles.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const content = await callOrchestrator(ASSETS_SYSTEM, `剧本梗概：\n${synopsis}\n\n分镜表：\n${shotList}`, 0.85, model);
  const parsed = parseOrThrow(content) as { assets?: unknown[]; nodes?: unknown[] };
  const arr = Array.isArray(parsed.assets) ? parsed.assets : Array.isArray(parsed.nodes) ? parsed.nodes : [];
  return arr
    .map((raw, i) => {
      const r = raw as Record<string, unknown>;
      const rawk = String(r.kind || "").trim();
      const kind = rawk === "scene" ? "scene" : rawk === "prop" ? "prop" : "character";
      const node: OrchestratedNode = {
        ref: String(r.ref || `a${i + 1}`).trim(),
        kind: kind as OrchestratedNode["kind"],
        title: String(r.title || "").trim() || `资产${i + 1}`,
        text: String(r.text || "").trim(),
      };
      if (kind === "character") {
        const g = String(r.gender || "").toLowerCase();
        // LLM 漏给 gender 时按名字/描述关键词兜底（默认 female）
        node.gender =
          g === "male" || g === "female"
            ? (g as "male" | "female")
            : /\bman\b|\bboy\b|\bmale\b|男|哥|爹|爷|叔|伯|先生|少爷|王爷|皇帝|父/.test(`${node.title} ${node.text}`)
              ? "male"
              : "female";
        const vt = String(r.voiceTone || "").trim();
        if (vt) node.voiceTone = vt;
      }
      const appearsIn = Array.isArray(r.appearsIn)
        ? (r.appearsIn as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n > 0)
        : [];
      return { node, appearsIn };
    })
    .filter((a) => a.node.title || a.node.text);
}

/**
 * 拓扑层布局 —— 按依赖层级分层、同层错开，得到清爽的"创作树"。
 * dir="h"（默认）：层级横向分列（旧版）；dir="v"：层级纵向向下（flowith 式，
 * 上游在上、成果向下生长），同层横向排开。入参为节点 id + 边，返回世界坐标。
 */
export function layoutByDepth(
  ids: string[],
  edges: { source: string; target: string }[],
  opts: { nodeW: number; colGap?: number; rowGap?: number; originX?: number; originY?: number; dir?: "h" | "v" }
): Map<string, { x: number; y: number }> {
  const dir = opts.dir ?? "h";
  const colGap = opts.colGap ?? (dir === "v" ? 56 : 120);
  const rowGap = opts.rowGap ?? (dir === "v" ? 380 : 320);
  const originX = opts.originX ?? 0;
  const originY = opts.originY ?? 0;
  const idSet = new Set(ids);
  const incoming = new Map<string, string[]>();
  ids.forEach((id) => incoming.set(id, []));
  edges.forEach((e) => {
    if (idSet.has(e.source) && idSet.has(e.target)) incoming.get(e.target)!.push(e.source);
  });
  // depth = 最长上游路径（带环保护）
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const calc = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0; // 环兜底
    visiting.add(id);
    const ups = incoming.get(id) ?? [];
    const d = ups.length ? Math.max(...ups.map(calc)) + 1 : 0;
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  ids.forEach(calc);
  // 同层计数 → 错开（h：纵向；v：横向，且整层围绕原点居中）
  const perCol = new Map<number, number>();
  ids.forEach((id) => {
    const d = depth.get(id)!;
    perCol.set(d, (perCol.get(d) ?? 0) + 1);
  });
  const seen = new Map<number, number>();
  const pos = new Map<string, { x: number; y: number }>();
  ids
    .slice()
    .sort((a, b) => (depth.get(a)! - depth.get(b)!))
    .forEach((id) => {
      const d = depth.get(id)!;
      const row = seen.get(d) ?? 0;
      seen.set(d, row + 1);
      if (dir === "v") {
        const count = perCol.get(d) ?? 1;
        const span = (opts.nodeW + colGap);
        pos.set(id, {
          x: originX + (row - (count - 1) / 2) * span, // 同层居中展开
          y: originY + d * rowGap,
        });
      } else {
        pos.set(id, {
          x: originX + d * (opts.nodeW + colGap),
          y: originY + row * rowGap,
        });
      }
    });
  return pos;
}
