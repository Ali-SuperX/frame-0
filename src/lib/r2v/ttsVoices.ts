/**
 * 百炼 TTS 音色库 —— 统一管理 qwen3-tts-flash 官方音色 + 旧版 CosyVoice 音色。
 *
 * voice id 直接传给 dashscope API 的 input.voice 字段。
 * 文档: https://help.aliyun.com/zh/model-studio/qwen-tts-api
 */

export type TTSVoice = {
  id: string;
  zh: string;
  gender: "male" | "female";
  lang: "zh" | "en" | "bilingual";
  desc: string;
  bestFor: string;
  /** 分组标签(UI 筛选用) */
  group: "qwen3" | "cosyvoice";
  weight: number;
};

// ── qwen3-tts-flash 官方音色 ──
const QWEN3_VOICES: TTSVoice[] = [
  { id: "Ethan", zh: "晨煦", gender: "male", lang: "bilingual", desc: "阳光沉稳,语速适中", bestFor: "产品介绍 / 男性向广告", group: "qwen3", weight: 100 },
  { id: "Cherry", zh: "芊悦", gender: "female", lang: "bilingual", desc: "温柔甜美,亲和力强", bestFor: "美妆 / 女性向种草", group: "qwen3", weight: 95 },
  { id: "Ryan", zh: "甜茶", gender: "male", lang: "bilingual", desc: "温和清亮,情感细腻", bestFor: "治愈系 / 情感 / 母婴", group: "qwen3", weight: 90 },
  { id: "Jennifer", zh: "詹妮弗", gender: "female", lang: "bilingual", desc: "知性优雅,商务感强", bestFor: "讲解 / 商务 / 高端品牌", group: "qwen3", weight: 85 },
  { id: "Nofish", zh: "不吃鱼", gender: "male", lang: "zh", desc: "活泼俏皮,网感强", bestFor: "UGC vlog / 探店", group: "qwen3", weight: 80 },
  { id: "Elias", zh: "墨讲师", gender: "male", lang: "zh", desc: "权威专业,沉稳厚重", bestFor: "教育 / 知识科普", group: "qwen3", weight: 75 },
  { id: "Katerina", zh: "卡捷琳娜", gender: "female", lang: "bilingual", desc: "国际范,英文标准", bestFor: "外贸 / 跨境 / 英文配音", group: "qwen3", weight: 70 },
  { id: "Vivian", zh: "薇薇安", gender: "female", lang: "bilingual", desc: "温暖成熟,叙事感", bestFor: "纪录片 / 品牌故事", group: "qwen3", weight: 68 },
  // 注:Daniel / Olivia 经实测不被 qwen3-tts-flash 接受(DashScope: Invalid voice),已移除。
  { id: "Marcus", zh: "马库斯", gender: "male", lang: "bilingual", desc: "沉稳有力,播音质感", bestFor: "新闻 / 播报 / 正式场景", group: "qwen3", weight: 62 },
  { id: "Stella", zh: "斯黛拉", gender: "female", lang: "bilingual", desc: "柔美细腻,感性", bestFor: "爱情 / ASMR / 睡前故事", group: "qwen3", weight: 60 },
];

// ── CosyVoice / Sambert 传统音色(部分用户已绑定) ──
const COSYVOICE_VOICES: TTSVoice[] = [
  { id: "longxiaochun", zh: "龙小淳", gender: "female", lang: "zh", desc: "温暖亲切,旁白感强", bestFor: "旁白 / 短剧女声", group: "cosyvoice", weight: 55 },
  { id: "longlaotie", zh: "龙老铁", gender: "male", lang: "zh", desc: "豪爽直率,东北味", bestFor: "搞笑 / 接地气内容", group: "cosyvoice", weight: 50 },
  { id: "longshu", zh: "龙书", gender: "male", lang: "zh", desc: "沉稳磁性,朗读感", bestFor: "有声书 / 小说旁白", group: "cosyvoice", weight: 48 },
  { id: "longmiao", zh: "龙喵", gender: "female", lang: "zh", desc: "活泼萌系,少女感", bestFor: "动画 / Q版 / 可爱角色", group: "cosyvoice", weight: 46 },
  { id: "longyue", zh: "龙悦", gender: "female", lang: "zh", desc: "优雅知性,端庄", bestFor: "古风 / 仙侠 / 女主", group: "cosyvoice", weight: 44 },
  { id: "longfei", zh: "龙飞", gender: "male", lang: "zh", desc: "阳光少年,元气", bestFor: "热血 / 少年向 / 男主", group: "cosyvoice", weight: 42 },
  { id: "longwan", zh: "龙婉", gender: "female", lang: "zh", desc: "温柔婉约,古典", bestFor: "古装 / 宫廷 / 女配", group: "cosyvoice", weight: 40 },
  { id: "longhua", zh: "龙华", gender: "male", lang: "zh", desc: "成熟稳重,中年感", bestFor: "商务 / 长辈 / 反派", group: "cosyvoice", weight: 38 },
  { id: "longxiaoxia", zh: "龙小夏", gender: "female", lang: "zh", desc: "元气少女,清脆", bestFor: "青春 / 校园 / 闺蜜", group: "cosyvoice", weight: 36 },
  { id: "longshuo", zh: "龙硕", gender: "male", lang: "zh", desc: "浑厚有力,权威", bestFor: "Boss / 反派 / 正剧", group: "cosyvoice", weight: 34 },
];

export const TTS_VOICES: TTSVoice[] = [...QWEN3_VOICES, ...COSYVOICE_VOICES];

/** 当前推荐的默认 TTS 模型 */
export const DEFAULT_TTS_MODEL = "qwen3-tts-flash";

/** CosyVoice 声音克隆模型 */
export const CLONE_TTS_MODEL = "cosyvoice-clone-v2";

/** 按 weight 排序的音色列表(UI 渲染顺序) */
export function listVoices(): TTSVoice[] {
  return [...TTS_VOICES].sort((a, b) => b.weight - a.weight);
}

export function listVoicesByGender(gender: "male" | "female"): TTSVoice[] {
  return listVoices().filter((v) => v.gender === gender);
}

/** 性格关键词 —— 桥接 voiceTone(中文) 与音色的 bestFor/desc。 */
const PERSONA_KEYWORDS = [
  "反派", "boss", "威严", "权威", "沉稳", "成熟", "中年", "磁性", "低沉", "厚重", "正剧",
  "少女", "元气", "活泼", "可爱", "萌", "清脆", "青春", "校园",
  "古风", "古装", "古典", "宫廷", "仙侠", "知性", "优雅", "端庄", "婉约",
  "温柔", "甜美", "治愈", "温暖", "感性", "柔美",
  "阳光", "少年", "热血", "清新", "商务", "旁白", "悬疑", "大气",
];

/**
 * 按角色性别 + 性格基调挑音色：性别先筛池，再用性格关键词与 bestFor/desc 交集打分，
 * 命中最多者胜（平手取 weight 高者，pool 已按 weight 降序）；无 tone 取池首。
 */
export function pickVoiceByPersona(gender: "male" | "female", tone?: string): string {
  const pool = listVoicesByGender(gender);
  if (!pool.length) return gender === "male" ? "longshu" : "longxiaochun";
  const t = (tone || "").toLowerCase();
  if (t.trim()) {
    let best = pool[0];
    let bestScore = 0;
    for (const v of pool) {
      const hay = `${v.bestFor} ${v.desc} ${v.zh}`.toLowerCase();
      let score = 0;
      for (const kw of PERSONA_KEYWORDS) {
        if (t.includes(kw) && hay.includes(kw)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    }
    return best.id;
  }
  return pool[0].id;
}

export function getVoice(id: string): TTSVoice | undefined {
  return TTS_VOICES.find((v) => v.id === id);
}

export function estimateCharCount(text: string): number {
  return text.trim().length;
}

export const TTS_PRICE_PER_1K_CHARS = 0.005;

export function estimatePrice(charCount: number): number {
  return (charCount / 1000) * TTS_PRICE_PER_1K_CHARS;
}
