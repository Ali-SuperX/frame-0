/**
 * R2V Prompt 场景预设 — 客户端轻量版
 *
 * 每个预设是一套「场景化写作规则 + 知识模块组合 + 风格」的捆绑包，
 * 帮用户聚焦到具体业务场景。重量级规则内容在 promptPresetsServer.ts。
 */

import type { PromptStyle } from "./chatSystemPrompt";

export type PromptPreset = {
  id: string;
  label: string;
  labelEn: string;
  emoji: string;
  /** 一句话场景描述（zh） */
  desc: string;
  descEn: string;
  /** 用于筛选的标签 */
  tags: string[];
  /** 风格倾向（影响字数密度） */
  style: PromptStyle;
  /** 是否触发电商知识模块 */
  ecommerce?: boolean;
  /**
   * 该预设需要载入的知识模块白名单。
   * 不在列表中的模块即使全局启用也不载入，省 token 并聚焦注意力。
   * 留空（undefined）= 载入全部默认模块（向后兼容）。
   */
  modules?: string[];
};

/** 所有预设标签字典 — 供筛选 UI 使用 */
export const PRESET_TAGS: Record<string, { zh: string; en: string }> = {
  // 大类
  ecommerce: { zh: "电商", en: "E-com" },
  narrative: { zh: "叙事", en: "Narrative" },
  stylized: { zh: "风格化", en: "Stylized" },
  utility: { zh: "功能型", en: "Utility" },
  generic: { zh: "通用", en: "Generic" },
  // 节奏 & 视觉
  "fast-paced": { zh: "快节奏", en: "Fast" },
  "slow-paced": { zh: "慢节奏", en: "Slow" },
  "high-saturation": { zh: "高饱和", en: "Vivid" },
  "low-saturation": { zh: "低饱和", en: "Muted" },
  cinematic: { zh: "电影感", en: "Cinematic" },
  macro: { zh: "微距", en: "Macro" },
  // 主体
  "real-person": { zh: "真人", en: "Real-person" },
  "no-human": { zh: "无人物", en: "No human" },
  "voice-over": { zh: "口播", en: "Voice-over" },
  ugc: { zh: "UGC", en: "UGC" },
  // 品类（电商细分）
  beauty: { zh: "美妆", en: "Beauty" },
  apparel: { zh: "服装", en: "Apparel" },
  food: { zh: "美食", en: "Food" },
  digital: { zh: "数码", en: "Digital" },
  home: { zh: "家居", en: "Home" },
  baby: { zh: "母婴", en: "Baby" },
  automotive: { zh: "汽车", en: "Auto" },
  // 风格细分
  mystery: { zh: "悬疑", en: "Mystery" },
  cyberpunk: { zh: "赛博", en: "Cyberpunk" },
  retro: { zh: "复古", en: "Retro" },
  steampunk: { zh: "蒸汽朋克", en: "Steampunk" },
  minimal: { zh: "极简", en: "Minimal" },
  artistic: { zh: "艺术", en: "Artistic" },
  // 社媒 / 生活
  vlog: { zh: "Vlog", en: "Vlog" },
  travel: { zh: "旅行", en: "Travel" },
  fitness: { zh: "健身", en: "Fitness" },
  healing: { zh: "治愈", en: "Healing" },
  // 节日营销
  festival: { zh: "节日", en: "Festival" },
  urgency: { zh: "促销", en: "Urgency" },
  // 官方最佳实践
  official: { zh: "官方指南", en: "Official" },
  "hh-tuned": { zh: "HH调优", en: "HH-tuned" },
};

export const PROMPT_PRESETS: PromptPreset[] = [
  // ─── 🎯 官方最佳实践（最高优先级推荐）───
  {
    id: "hh-official",
    emoji: "🎯",
    label: "HH 官方最佳实践",
    labelEn: "HH Official",
    desc: "严格遵循《HH Prompt Guide V3》：五维度 + 友好词 + 微表情量化 + 边界规避",
    descEn: "Strictly follows HH Prompt Guide V3: 5-dimensions + friendly words + quantified micro-expressions",
    tags: ["official", "hh-tuned", "cinematic"],
    style: "detailed",
    modules: ["r2v-guide", "camera", "checklist", "negative", "templates"],
  },
  {
    id: "hh-drama",
    emoji: "🎭",
    label: "真人短剧（HH 最佳实践）",
    labelEn: "HH Real-Person Drama",
    desc: "多人对峙/情感摊牌：空间关系前置 + 情绪渐变 + 动作三段式 + 跨镜承接 + 台词时长公式",
    descEn: "Multi-person drama: spatial setup + emotion gradient + action 3-phase + cross-shot continuity",
    tags: ["official", "narrative", "real-person", "voice-over", "cinematic", "hh-tuned"],
    style: "detailed",
    modules: ["r2v-guide", "camera", "checklist", "negative", "templates"],
  },

  // ─── 电商系 ───
  {
    id: "ecom-punch",
    emoji: "🔥",
    label: "电商爆款",
    labelEn: "E-com Punch",
    desc: "3-5 镜抖音节奏，前 3 秒钩子 + 最终 Pack Shot",
    descEn: "3-5 shots, hook + Pack Shot, TikTok pacing",
    tags: ["ecommerce", "fast-paced", "high-saturation"],
    style: "concise",
    ecommerce: true,
    modules: ["r2v-guide", "negative", "ecommerce", "templates"],
  },
  {
    id: "ecom-luxury",
    emoji: "💎",
    label: "电商奢品",
    labelEn: "E-com Luxury",
    desc: "慢推长镜头，低饱和质感光影",
    descEn: "Slow push, muted tones, sculpted light",
    tags: ["ecommerce", "slow-paced", "low-saturation", "cinematic"],
    style: "detailed",
    ecommerce: true,
    modules: ["r2v-guide", "camera", "negative", "ecommerce", "templates"],
  },
  {
    id: "ecom-ugc",
    emoji: "🛒",
    label: "电商种草",
    labelEn: "E-com UGC",
    desc: "UGC 手持真人测评，Before/After 口播",
    descEn: "Handheld UGC, before/after, voice-over",
    tags: ["ecommerce", "ugc", "real-person", "voice-over"],
    style: "concise",
    ecommerce: true,
    modules: ["r2v-guide", "negative", "ecommerce", "templates"],
  },

  // ─── 叙事系 ───
  {
    id: "cinematic",
    emoji: "🎬",
    label: "电影质感",
    labelEn: "Cinematic",
    desc: "戏剧光、广角、长镜头、情绪铺垫",
    descEn: "Dramatic light, wide angle, long takes",
    tags: ["narrative", "slow-paced", "cinematic"],
    style: "detailed",
    modules: ["r2v-guide", "camera", "checklist", "negative"],
  },
  {
    id: "seedance-style",
    emoji: "🎞️",
    label: "Seedance 风格",
    labelEn: "Seedance Style",
    desc: "长 prompt + 摄影术语 + 电影感，借鉴 Seedance 2.0 写法（25mm/0.3s 长曝光/anamorphic）",
    descEn: "Long prompt + photography terms, inspired by Seedance 2.0",
    tags: ["narrative", "stylized", "cinematic", "slow-paced"],
    style: "detailed",
    modules: ["r2v-guide", "camera", "checklist", "negative"],
  },
  {
    id: "emotional",
    emoji: "❤️",
    label: "情感短片",
    labelEn: "Emotional",
    desc: "人物特写驱动叙事，留白",
    descEn: "Character close-ups, restrained pacing",
    tags: ["narrative", "real-person", "slow-paced"],
    style: "detailed",
    modules: ["r2v-guide", "camera", "negative"],
  },

  // ─── 风格化 ───
  {
    id: "anime",
    emoji: "✨",
    label: "动漫风",
    labelEn: "Anime",
    desc: "2D 平涂、夸张运镜、鲜艳配色",
    descEn: "2D flat color, exaggerated motion",
    tags: ["stylized", "high-saturation", "fast-paced"],
    style: "concise",
    modules: ["r2v-guide", "negative"],
  },
  {
    id: "cartoon",
    emoji: "🎨",
    label: "卡通广告",
    labelEn: "Cartoon Ad",
    desc: "圆润形状、明快节奏、IP 拟人",
    descEn: "Soft shapes, bright pacing, mascot",
    tags: ["stylized", "high-saturation"],
    style: "concise",
    modules: ["r2v-guide", "negative"],
  },

  // ─── 功能型 ───
  {
    id: "macro-product",
    emoji: "🔬",
    label: "产品微距",
    labelEn: "Macro Product",
    desc: "单镜头特写，无人，纯净背景",
    descEn: "Macro detail shot, no human, clean BG",
    tags: ["utility", "macro", "no-human"],
    style: "concise",
    modules: ["r2v-guide", "camera", "negative"],
  },
  {
    id: "talking-head",
    emoji: "🎙️",
    label: "真人测评",
    labelEn: "Talking Head",
    desc: "单机位口播，自然光，字幕浮现",
    descEn: "Static shot, voice-over, captions",
    tags: ["utility", "real-person", "voice-over"],
    style: "concise",
    modules: ["r2v-guide", "negative", "templates"],
  },

  // ─── 电商品类深耕 ───
  {
    id: "beauty-macro",
    emoji: "💄",
    label: "美妆护肤",
    labelEn: "Beauty Macro",
    desc: "环形柔光 + 微距毛孔 + 上妆动作 + 肤感对比",
    descEn: "Ring light + macro pores + makeup action + skin comparison",
    tags: ["ecommerce", "beauty", "slow-paced", "macro", "real-person"],
    style: "detailed",
    ecommerce: true,
    modules: ["r2v-guide", "camera", "negative", "ecommerce"],
  },
  {
    id: "apparel-runway",
    emoji: "👗",
    label: "服装穿搭",
    labelEn: "Apparel Runway",
    desc: "走秀感跟拍 + 面料飘逸 + 转身轮廓 + 细节特写",
    descEn: "Runway feel, fabric flow, turn silhouette, detail close-up",
    tags: ["ecommerce", "apparel", "real-person", "slow-paced"],
    style: "detailed",
    ecommerce: true,
    modules: ["r2v-guide", "camera", "negative", "ecommerce"],
  },
  {
    id: "food-asmr",
    emoji: "🍰",
    label: "美食 ASMR",
    labelEn: "Food ASMR",
    desc: "暖侧光 + 微距汁液/拉丝/热气 + 极慢诱人节奏",
    descEn: "Warm side light, macro juice/cheese pull/steam, slow tempting pace",
    tags: ["ecommerce", "food", "macro", "slow-paced"],
    style: "detailed",
    ecommerce: true,
    modules: ["r2v-guide", "camera", "negative", "ecommerce"],
  },
  {
    id: "digital-tech",
    emoji: "📱",
    label: "数码科技",
    labelEn: "Digital Tech",
    desc: "冷调棚拍 + 边缘逆光勾轮廓 + 无人 + 参数浮现",
    descEn: "Cool studio, rim light, no human, spec callouts",
    tags: ["ecommerce", "digital", "macro", "no-human", "cinematic"],
    style: "detailed",
    ecommerce: true,
    modules: ["r2v-guide", "camera", "negative", "ecommerce"],
  },

  // ─── 叙事细分 ───
  {
    id: "mystery-dark",
    emoji: "🌌",
    label: "悬疑暗调",
    labelEn: "Mystery / Dark",
    desc: "低饱和冷青墨绿 + 黑色占≥50% + 雾感 + 单一硬光",
    descEn: "Muted teal/dark green, ≥50% black, fog, single hard light",
    tags: ["narrative", "mystery", "slow-paced", "low-saturation", "cinematic"],
    style: "detailed",
    modules: ["r2v-guide", "camera", "checklist", "negative"],
  },

  // ─── 风格化细分 ───
  {
    id: "cyberpunk",
    emoji: "🎮",
    label: "赛博朋克",
    labelEn: "Cyberpunk",
    desc: "霓虹洋红+青 + 雨夜街道 + 湿地面反射 + 烟雾",
    descEn: "Neon magenta+cyan, rainy street, wet reflections, smoke",
    tags: ["stylized", "cyberpunk", "high-saturation", "cinematic"],
    style: "concise",
    modules: ["r2v-guide", "camera", "negative"],
  },
  {
    id: "retro-film",
    emoji: "🎞️",
    label: "复古胶片",
    labelEn: "Retro Film",
    desc: "胶片颗粒+褪色 + 偏黄偏青 + 70-80年代复古元素",
    descEn: "Film grain, faded tones, yellow/teal cast, 70s-80s props",
    tags: ["stylized", "retro", "low-saturation"],
    style: "concise",
    modules: ["r2v-guide", "camera", "negative"],
  },

  // ─── 电商品类深耕（续）───
  {
    id: "home-lifestyle",
    emoji: "🏠",
    label: "家居生活",
    labelEn: "Home Lifestyle",
    desc: "暖光生活感 + 自然窗光 + 沙发餐桌场景 + 慢节奏",
    descEn: "Warm lifestyle, window light, sofa/dining scene, slow pace",
    tags: ["ecommerce", "home", "slow-paced"],
    style: "detailed",
    ecommerce: true,
    modules: ["r2v-guide", "camera", "negative", "ecommerce"],
  },
  {
    id: "baby-mom",
    emoji: "👶",
    label: "母婴温馨",
    labelEn: "Baby & Mom",
    desc: "柔焦奶白 + 极慢节奏 + 棉绒柔软质地 + 温柔旁白",
    descEn: "Soft cream tone, very slow, soft cotton textures, gentle VO",
    tags: ["ecommerce", "baby", "slow-paced", "real-person"],
    style: "detailed",
    ecommerce: true,
    modules: ["r2v-guide", "camera", "negative", "ecommerce"],
  },
  {
    id: "automotive",
    emoji: "🚗",
    label: "汽车广告",
    labelEn: "Automotive",
    desc: "戏剧侧光勾轮廓 + 行驶动态 + 金属冷调 + 渐快节奏",
    descEn: "Sculpting rim light, driving dynamic, metallic cool tone",
    tags: ["ecommerce", "automotive", "cinematic"],
    style: "detailed",
    ecommerce: true,
    modules: ["r2v-guide", "camera", "negative", "ecommerce"],
  },

  // ─── 生活流细分 ───
  {
    id: "food-vlog",
    emoji: "🍽️",
    label: "探店 Vlog",
    labelEn: "Restaurant Vlog",
    desc: "第一视角进店 + 菜品上桌 + 入口反应 + 街头市井气",
    descEn: "POV walk-in, dish reveal, first bite reaction, street vibe",
    tags: ["ugc", "food", "vlog", "real-person", "fast-paced"],
    style: "concise",
    modules: ["r2v-guide", "negative", "templates"],
  },
  {
    id: "travel-destination",
    emoji: "🏔️",
    label: "旅游目的地",
    labelEn: "Travel Destination",
    desc: "黄金/蓝调时间 + 地标全景 + 人物剪影背影 + 大景长镜",
    descEn: "Golden/blue hour, landmark wide, silhouette person, long shots",
    tags: ["travel", "narrative", "slow-paced", "cinematic"],
    style: "detailed",
    modules: ["r2v-guide", "camera", "negative"],
  },
  {
    id: "fitness",
    emoji: "💪",
    label: "健身塑形",
    labelEn: "Fitness",
    desc: "侧光勾肌肉线条 + 汗水/呼吸特写 + 高对比 + 节拍式快切",
    descEn: "Rim-lit muscle lines, sweat/breath close-up, beat cuts",
    tags: ["fitness", "real-person", "fast-paced", "cinematic"],
    style: "concise",
    modules: ["r2v-guide", "camera", "negative"],
  },

  // ─── 叙事细分（续）───
  {
    id: "healing",
    emoji: "🌸",
    label: "治愈系",
    labelEn: "Healing",
    desc: "莫兰迪色系 + 柔光自然 + 空镜留白 + 极慢长镜",
    descEn: "Morandi palette, soft natural light, empty shots, long takes",
    tags: ["narrative", "healing", "slow-paced", "low-saturation"],
    style: "detailed",
    modules: ["r2v-guide", "camera", "checklist", "negative"],
  },

  // ─── 节日营销 ───
  {
    id: "festival-cny",
    emoji: "🧧",
    label: "春节氛围",
    labelEn: "Chinese New Year",
    desc: "中国红+鎏金 + 灯笼烛光 + 团圆元素 + 喜庆暖光",
    descEn: "Red+gold, lanterns, reunion props, warm festive",
    tags: ["festival", "ecommerce", "high-saturation"],
    style: "detailed",
    ecommerce: true,
    modules: ["r2v-guide", "camera", "negative", "ecommerce"],
  },
  {
    id: "festival-xmas",
    emoji: "🎄",
    label: "圣诞节",
    labelEn: "Christmas",
    desc: "松绿+酒红+雪白 + 暖串灯+冷雪光 + 圣诞树礼物",
    descEn: "Pine+wine+snow, warm string lights, tree/gifts",
    tags: ["festival", "ecommerce", "high-saturation"],
    style: "detailed",
    ecommerce: true,
    modules: ["r2v-guide", "camera", "negative", "ecommerce"],
  },
  {
    id: "double-11",
    emoji: "🛍️",
    label: "双十一爆款",
    labelEn: "11.11 Sale",
    desc: "红黄高饱和 + 价格冲击+倒计时字幕 + 极快卡点节奏",
    descEn: "High-sat red/yellow, price hits, countdown, fast cuts",
    tags: ["urgency", "ecommerce", "fast-paced", "high-saturation"],
    style: "concise",
    ecommerce: true,
    modules: ["r2v-guide", "negative", "ecommerce", "templates"],
  },

  // ─── 风格化（续）───
  {
    id: "steampunk",
    emoji: "⚙️",
    label: "蒸汽朋克",
    labelEn: "Steampunk",
    desc: "黄铜齿轮 + 维多利亚 + 煤气灯暖橙 + 蒸汽烟雾",
    descEn: "Brass gears, Victorian, gaslight orange, steam fog",
    tags: ["stylized", "steampunk", "low-saturation"],
    style: "concise",
    modules: ["r2v-guide", "camera", "negative"],
  },
  {
    id: "minimal",
    emoji: "⚪",
    label: "极简主义",
    labelEn: "Minimal",
    desc: "单色大留白 + 均匀漫反射 + 几何构图 + 极慢 3 镜",
    descEn: "Monochrome whitespace, even light, geometry, ultra slow",
    tags: ["stylized", "minimal", "slow-paced", "low-saturation"],
    style: "concise",
    modules: ["r2v-guide", "camera", "negative"],
  },
  {
    id: "artistic-oil",
    emoji: "🎭",
    label: "油画质感",
    labelEn: "Oil Painting",
    desc: "印象派笔触 + 厚涂感 + 莫兰迪/古典配色 + 艺术构图",
    descEn: "Impressionist brushstroke, impasto, classical palette",
    tags: ["stylized", "artistic", "slow-paced"],
    style: "concise",
    modules: ["r2v-guide", "negative"],
  },

  // ─── 社交媒体 ───
  {
    id: "xhs-vlog",
    emoji: "📕",
    label: "小红书 Vlog",
    labelEn: "Xiaohongshu Vlog",
    desc: "手持第一人称 + 奶油色滤镜 + 粉色手写字幕 + 姐妹口播",
    descEn: "Handheld POV, cream filter, pink handwriting captions, casual VO",
    tags: ["ecommerce", "ugc", "vlog", "real-person", "voice-over", "fast-paced"],
    style: "concise",
    modules: ["r2v-guide", "negative", "ecommerce", "templates"],
  },

  // ─── 通用 ───
  {
    id: "auto",
    emoji: "🎲",
    label: "自动判断",
    labelEn: "Auto",
    desc: "不施加场景约束，模型按 Card1 配置自由发挥",
    descEn: "No scene constraint, model decides",
    tags: ["generic"],
    style: "concise",
    // auto 不限制模块，载入全部默认
  },
];

/** 根据 id 查预设 */
export function getPresetById(id: string, extra?: PromptPreset[]): PromptPreset | undefined {
  return PROMPT_PRESETS.find((p) => p.id === id)
    ?? extra?.find((p) => p.id === id);
}

/**
 * 根据 preset 的 tags 智能匹配 HH Guide 中最相关的章节，
 * 用于 preset 预览 modal 底部"想了解背后方法论"的精准跳转。
 * 不再硬编码"电商 11 条"——叙事 preset 跳到方法论，风格化跳到案例…
 */
export function guideAnchorForPreset(preset: PromptPreset | undefined): {
  anchor: string;
  zh: string;
  en: string;
} {
  if (!preset) return { anchor: "overview", zh: "HH 指南总览", en: "HH Guide Overview" };
  const tags = preset.tags;

  // 优先级：官方最佳实践 > 电商 > 叙事 > 风格化 > 功能型 > 节日 > 通用
  if (preset.id === "hh-drama") {
    return { anchor: "cases", zh: "最佳实践案例 · 多人叙事场景", en: "Multi-person Drama Cases" };
  }
  if (tags.includes("official") || preset.id === "hh-official") {
    return { anchor: "overview", zh: "总览 · 八大优势 · HH 友好词", en: "Overview · Strengths" };
  }
  if (tags.includes("ecommerce")) {
    return { anchor: "ecom", zh: "电商专项 11 条原则", en: "E-com Playbook" };
  }
  if (tags.includes("narrative") || tags.includes("cinematic")) {
    return { anchor: "formula", zh: "核心公式 + 五维度拆解法", en: "Core Formula + 5 Dimensions" };
  }
  if (tags.includes("stylized")) {
    return { anchor: "cases", zh: "最佳实践案例 · 风格化场景", en: "Showcase · Stylized Cases" };
  }
  if (tags.includes("macro") || tags.includes("no-human")) {
    return { anchor: "modes", zh: "四大生成模式 · R2V/I2V 适配", en: "Four Modes" };
  }
  if (tags.includes("utility") || tags.includes("vlog") || tags.includes("voice-over")) {
    return { anchor: "checklist", zh: "完整检查清单", en: "Checklist" };
  }
  if (tags.includes("festival") || tags.includes("urgency")) {
    return { anchor: "ecom", zh: "电商专项 11 条原则", en: "E-com Playbook" };
  }
  return { anchor: "tune", zh: "调优三档深度方法", en: "3-Tier Tuning Depth" };
}

/**
 * 根据 Card1 配置推荐最合适的预设 id。
 * 返回值是 PROMPT_PRESETS 里的 id；若无明显推荐则返回 null（用户自己挑）。
 *
 * 推荐规则按优先级从上到下：
 *   - contentDirection + category/sceneType 的组合 → 命中具体 preset
 *   - 单独某个字段强信号 → 通用 preset
 *   - 全部留空 → null（无推荐）
 */
export function recommendPresetId(input: {
  contentDirection?: string;
  category?: string;
  sceneType?: string;
}): string | null {
  const { contentDirection: dir, category: cat, sceneType: scene } = input;

  // 强组合规则
  if (dir === "ugc") return "ecom-ugc";
  if (dir === "luxury") return "ecom-luxury";
  if (dir === "emotional") return "emotional";
  if (dir === "cartoon") return "anime"; // 动漫 + 卡通都先指向动漫
  if (dir === "landscape") return "cinematic";
  if (dir === "action") return "cinematic";

  // 电商方向 — 再看场景类型细分
  if (dir === "ecommerce") {
    if (scene === "single-multi-angle" && cat === "luxury") return "ecom-luxury";
    if (scene === "single-multi-angle") return "macro-product";
    if (cat === "ugc") return "ecom-ugc";
    return "ecom-punch"; // 默认推荐爆款
  }

  // 仅有场景类型信号
  if (scene === "single-multi-angle") return "macro-product";
  if (scene === "multi-subject" || scene === "storyboard") return "cinematic";

  return null;
}
