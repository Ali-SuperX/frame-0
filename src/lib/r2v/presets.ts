/**
 * R2V Project Workspace — preset libraries.
 *
 * Three datasets, all consumed by Card 1 and embedded into input.json so the
 * agent can pick them up directly:
 *
 *   • STYLES        — 38 named visual references (Wong Kar-wai, Kodak Portra…)
 *   • EXCLUDES      — 8 negative chips that wipe common AI-video clichés
 *   • SELLING_POINT_ANCHORS — 30-entry dictionary translating abstract Chinese
 *                     marketing words ("显瘦", "高级感"…) into concrete visual
 *                     anchors the model can actually render.
 *
 * Every entry has stable id, ZH/EN labels, and a short hint. The structure
 * lines up with the optimization_checklist.md vocabulary so prompts stay
 * consistent across the whole pipeline.
 */

export type StylePreset = {
  id: string;
  group: "eastern" | "western" | "classic" | "fashion" | "anime" | "mood" | "film";
  zh: string;
  en: string;
  /** Short hint shown under the option — what AI training data it taps. */
  hint: string;
  /** Cue line the agent prepends/folds into the prompt. */
  cue: string;
};

export const STYLES: StylePreset[] = [
  /* ── 东方电影感 (6) ── */
  {
    id: "wong-kar-wai",
    group: "eastern",
    zh: "王家卫",
    en: "Wong Kar-wai",
    hint: "饱和色 / 慢门 / 霓虹光斑",
    cue: "Wong Kar-wai aesthetic, saturated neons, slow-shutter motion blur, intimate close-ups",
  },
  {
    id: "iwai-shunji",
    group: "eastern",
    zh: "岩井俊二",
    en: "Iwai Shunji",
    hint: "逆光 / 柔焦 / 青春绿",
    cue: "Iwai Shunji aesthetic, hazy back-light, soft-focus, pale green palette",
  },
  {
    id: "kore-eda",
    group: "eastern",
    zh: "是枝裕和",
    en: "Hirokazu Kore-eda",
    hint: "自然光 / 家庭剧 / 温润",
    cue: "Kore-eda quiet realism, daylight interiors, soft warm tones, observational framing",
  },
  {
    id: "ang-lee",
    group: "eastern",
    zh: "李安",
    en: "Ang Lee",
    hint: "克制 / 古典构图",
    cue: "Ang Lee classical restraint, balanced composition, suppressed color, muted contrast",
  },
  {
    id: "zhang-yimou",
    group: "eastern",
    zh: "张艺谋",
    en: "Zhang Yimou",
    hint: "高饱和 / 色块对比",
    cue: "Zhang Yimou high-saturation color blocking, symmetrical wide shots, theatrical lighting",
  },
  {
    id: "kogonada",
    group: "eastern",
    zh: "Kogonada 极简",
    en: "Kogonada minimal",
    hint: "对称 / 留白 / 静止",
    cue: "Kogonada minimalism, symmetrical static frames, generous negative space",
  },

  /* ── 西方电影感 (6) ── */
  {
    id: "wes-anderson",
    group: "western",
    zh: "韦斯·安德森",
    en: "Wes Anderson",
    hint: "对称 / 糖果色",
    cue: "Wes Anderson symmetry, candy-color pastel palette, dollhouse staging, deadpan blocking",
  },
  {
    id: "fincher",
    group: "western",
    zh: "大卫·芬奇",
    en: "David Fincher",
    hint: "冷色 / 精确镜头",
    cue: "Fincher cool teal palette, surgically precise dolly, hard top-light shadows",
  },
  {
    id: "denis-villeneuve",
    group: "western",
    zh: "维伦纽瓦",
    en: "Denis Villeneuve",
    hint: "宽幅 / 巨物 / 雾",
    cue: "Villeneuve cinematic scale, anamorphic 2.39:1, monumental silhouettes in haze",
  },
  {
    id: "nolan",
    group: "western",
    zh: "诺兰 IMAX",
    en: "Nolan IMAX",
    hint: "实拍质感 / 65mm",
    cue: "Nolan IMAX realism, 65mm grain, practical fire/smoke, no CGI sheen",
  },
  {
    id: "spielberg-amblin",
    group: "western",
    zh: "斯皮尔伯格 Amblin",
    en: "Spielberg / Amblin",
    hint: "魔法时刻 / 仰拍",
    cue: "Amblin magic-hour wonder, low-angle awe shots, flare-kissed silhouette",
  },
  {
    id: "tarantino",
    group: "western",
    zh: "昆汀",
    en: "Tarantino",
    hint: "饱和 / 长对话 / 复古",
    cue: "Tarantino retro saturation, 70s grindhouse stock, talky long takes",
  },

  /* ── 经典电影 (6) ── */
  {
    id: "blade-runner-2049",
    group: "classic",
    zh: "银翼杀手 2049",
    en: "Blade Runner 2049",
    hint: "橙黄沙暴 / 巨幅广告",
    cue: "Blade Runner 2049 dust-orange megastructure, volumetric haze, neon billboards",
  },
  {
    id: "in-the-mood-for-love",
    group: "classic",
    zh: "花样年华",
    en: "In the Mood for Love",
    hint: "旗袍 / 红绿对比",
    cue: "In the Mood for Love qipao silhouettes, red-green saturated contrast, slow handheld",
  },
  {
    id: "drive-2011",
    group: "classic",
    zh: "亡命驾驶 (2011)",
    en: "Drive (2011)",
    hint: "粉紫霓虹 / 慢节奏",
    cue: "Drive (2011) pink-magenta neon, slow synth-wave pace, calm Steadicam",
  },
  {
    id: "joker-2019",
    group: "classic",
    zh: "小丑 (2019)",
    en: "Joker (2019)",
    hint: "脏黄滤镜 / 颗粒",
    cue: "Joker (2019) sickly mustard filter, heavy 35mm grain, hard sodium street light",
  },
  {
    id: "her",
    group: "classic",
    zh: "她 (Her)",
    en: "Her",
    hint: "粉橙调 / 浅景深",
    cue: "Her warm peach pastel, shallow 50mm depth, gentle backlit interiors",
  },
  {
    id: "lalaland",
    group: "classic",
    zh: "爱乐之城",
    en: "La La Land",
    hint: "宽银幕 / 紫黄色 / 歌舞",
    cue: "La La Land 2.55:1 widescreen, magenta-mustard duotone, balletic camera moves",
  },

  /* ── 时尚 / 广告 (5) ── */
  {
    id: "vogue-editorial",
    group: "fashion",
    zh: "Vogue 大刊",
    en: "Vogue editorial",
    hint: "硬光 / 极简白底",
    cue: "Vogue editorial harsh key light, white seamless cyc, sculpted shadows on fabric",
  },
  {
    id: "apple-product",
    group: "fashion",
    zh: "Apple 产品片",
    en: "Apple product",
    hint: "黑底 / 边光 / CGI 净亮",
    cue: "Apple product film, gradient black backdrop, rim-light CGI gloss, 2-second hero rotates",
  },
  {
    id: "lemaire-quiet",
    group: "fashion",
    zh: "Lemaire 静奢",
    en: "Lemaire quiet luxury",
    hint: "低饱和 / 大地色 / 慢镜",
    cue: "Lemaire quiet-luxury palette, low-saturation earth tones, slow drape-focused dolly",
  },
  {
    id: "off-white-streetwear",
    group: "fashion",
    zh: "Off-White 街头",
    en: "Off-White streetwear",
    hint: "高对比 / 反光带 / 都市夜",
    cue: "Off-White streetwear edge, hard contrast, 3M reflective trims, urban-night ambience",
  },
  {
    id: "uniqlo-clean",
    group: "fashion",
    zh: "Uniqlo 干净",
    en: "Uniqlo clean",
    hint: "柔光 / 浅灰底 / 真实",
    cue: "Uniqlo clean lifestyle, soft daylight, light-grey seamless, natural skin tones",
  },

  /* ── 动画 / 插画 (4) ── */
  {
    id: "ghibli",
    group: "anime",
    zh: "吉卜力",
    en: "Ghibli",
    hint: "手绘 / 暖光 / 风草",
    cue: "Ghibli hand-drawn warmth, sun-dappled wind through grass, watercolor backgrounds",
  },
  {
    id: "shinkai",
    group: "anime",
    zh: "新海诚",
    en: "Makoto Shinkai",
    hint: "光影爆发 / 高饱和天空",
    cue: "Shinkai luminous skies, god-ray bursts, hyper-saturated cumulus clouds",
  },
  {
    id: "spider-verse",
    group: "anime",
    zh: "蜘蛛侠平行宇宙",
    en: "Spider-Verse",
    hint: "网点 / 双线 / 紫粉",
    cue: "Spider-Verse half-tone dots, doubled outlines, magenta-cyan duotone",
  },
  {
    id: "claymation",
    group: "anime",
    zh: "黏土定格",
    en: "Claymation",
    hint: "黏土 / 抖动 / 暖灯",
    cue: "Claymation stop-motion, plasticine textures, sub-24fps frame stutter, tungsten light",
  },

  /* ── 视觉氛围 (5) ── */
  {
    id: "golden-hour",
    group: "mood",
    zh: "黄金时刻",
    en: "Golden hour",
    hint: "低角度日落 / 长投影",
    cue: "Golden-hour low sun, long shadows, warm rim-light through dust",
  },
  {
    id: "blue-hour",
    group: "mood",
    zh: "蓝色时刻",
    en: "Blue hour",
    hint: "日落后 20 分钟",
    cue: "Blue-hour twilight, deep cyan sky, warm window-glow accents",
  },
  {
    id: "rainy-night-neon",
    group: "mood",
    zh: "雨夜霓虹",
    en: "Rainy-night neon",
    hint: "湿地反射 / 蒸汽",
    cue: "Rainy-night neon, wet asphalt reflections, steam from grates",
  },
  {
    id: "foggy-morning",
    group: "mood",
    zh: "晨雾",
    en: "Foggy morning",
    hint: "层次空气透视",
    cue: "Foggy morning atmospheric perspective, hazy depth layers, muted palette",
  },
  {
    id: "harsh-noon",
    group: "mood",
    zh: "正午硬光",
    en: "Harsh noon",
    hint: "顶光 / 高对比 / 短影",
    cue: "Harsh noon overhead sun, hard top-light, short cast shadows",
  },

  /* ── 胶片质感 (6) ── */
  {
    id: "kodak-portra-400",
    group: "film",
    zh: "Kodak Portra 400",
    en: "Kodak Portra 400",
    hint: "肤色奶油 / 颗粒",
    cue: "Kodak Portra 400 creamy skin tones, fine grain, lifted blacks",
  },
  {
    id: "fuji-pro-400h",
    group: "film",
    zh: "Fuji Pro 400H",
    en: "Fuji Pro 400H",
    hint: "青绿 / 柔粉",
    cue: "Fuji Pro 400H teal-pastel palette, gentle pink mid-tones",
  },
  {
    id: "cinestill-800t",
    group: "film",
    zh: "CineStill 800T",
    en: "CineStill 800T",
    hint: "霓虹光晕 / 红渗",
    cue: "CineStill 800T halation glow around highlights, red bleed, tungsten-balanced",
  },
  {
    id: "16mm-grain",
    group: "film",
    zh: "16mm 颗粒",
    en: "16mm grain",
    hint: "粗颗粒 / 复古",
    cue: "16mm coarse grain, slight gate weave, faded contrast",
  },
  {
    id: "vhs-1989",
    group: "film",
    zh: "VHS 1989",
    en: "VHS 1989",
    hint: "扫描线 / 色边",
    cue: "VHS 1989 scanlines, chroma bleed, low-band tape softness",
  },
  {
    id: "polaroid-sx70",
    group: "film",
    zh: "Polaroid SX-70",
    en: "Polaroid SX-70",
    hint: "暖偏色 / 边角晕",
    cue: "Polaroid SX-70 warm cast, vignette corners, chemical bloom highlights",
  },
];

export const STYLE_GROUPS: { id: StylePreset["group"]; zh: string; en: string }[] = [
  { id: "eastern", zh: "东方电影感", en: "Eastern cinema" },
  { id: "western", zh: "西方电影感", en: "Western cinema" },
  { id: "classic", zh: "经典电影", en: "Classic films" },
  { id: "fashion", zh: "时尚 / 广告", en: "Fashion & ads" },
  { id: "anime", zh: "动画 / 插画", en: "Anime & illustration" },
  { id: "mood", zh: "视觉氛围", en: "Mood & lighting" },
  { id: "film", zh: "胶片质感", en: "Film stock" },
];

/* ─────────── negative excludes ─────────── */

export type ExcludePreset = {
  id: string;
  zh: string;
  en: string;
  cue: string;
};

export const EXCLUDES: ExcludePreset[] = [
  {
    id: "ai-cliches",
    zh: "AI 视频套路",
    en: "AI video clichés",
    cue: "no AI-video clichés (autumn leaves swirl, perfect-timing eye contact, slow-mo hair flip)",
  },
  {
    id: "uncanny-faces",
    zh: "AI 怪脸",
    en: "Uncanny faces",
    cue: "no uncanny-valley faces, no melted features, no extra fingers",
  },
  {
    id: "warped-product",
    // Strengthened from "no morphing logos..." after the B 站 Blender+Seedance
    // 2.0 case study: product geometry warping is the #1 废稿 cause for
    // e-commerce R2V. Stronger negative + rigid-surface clause.
    // See ~/.claude/skills/video-prompt-generator/references/r2v_complete_guide.md
    // → 产品几何锚定 (6-layer defense).
    zh: "产品变形",
    en: "Warped product",
    cue: "no warped product, no morphing geometry, no proportion drift, no shifted button positions, no melted logos, no fluid distortion of rigid surfaces",
  },
  {
    id: "over-cgi",
    zh: "过度 CGI",
    en: "Over-CGI",
    cue: "no plastic over-rendered CGI sheen, no synthetic skin, no glossy wet floors unless specified",
  },
  {
    id: "background-strobe",
    zh: "背景闪烁",
    en: "Background strobe",
    cue: "no flickering backgrounds, no popping textures, no strobe reflections",
  },
  {
    id: "fake-text",
    zh: "乱码文字",
    en: "Garbled text",
    cue: "no garbled text on signage / packaging, no nonsense glyphs",
  },
  {
    id: "voice-over-takeover",
    zh: "口播覆盖",
    en: "Selfie talking-head takeover",
    cue: "do not collapse the multi-shot demo into a single talking-head selfie",
  },
  {
    id: "luxury-cliches",
    zh: "Luxury 滥词",
    en: "Luxury filler",
    cue: "drop generic luxury filler (crushed velvet, gold dust, slow piano) unless explicitly asked",
  },
];

/* ─────────── abstract selling points → visual anchors ─────────── */

export type SellingPointAnchor = {
  /** Trigger phrase (Chinese-first, the way users type). */
  trigger: string;
  /** Optional alternate triggers we should also catch. */
  aliases?: string[];
  /** What the agent should render instead. */
  visual: string;
};

export const SELLING_POINT_ANCHORS: SellingPointAnchor[] = [
  {
    trigger: "显瘦",
    aliases: ["显廋", "看起来瘦"],
    visual:
      "fabric draping naturally at the waist with vertical folds (not stretched), high-rise cut elongating the leg line",
  },
  {
    trigger: "显白",
    aliases: ["看起来白"],
    visual:
      "side back-light glancing off the collarbone, neutral background tones, clean reflected fill on the face",
  },
  {
    trigger: "显高",
    visual:
      "low camera angle below waist, vertical lines in the environment (door frames, columns) reinforcing height",
  },
  {
    trigger: "显年轻",
    visual:
      "soft diffused light flattening fine lines, natural skin texture preserved, lively eye catchlights",
  },
  {
    trigger: "高级感",
    aliases: ["有质感", "高质感"],
    visual:
      "low-saturation palette, controlled negative space, slow precise camera moves, matte materials over glossy",
  },
  {
    trigger: "氛围感",
    visual:
      "volumetric haze with visible light rays, warm practicals in the background, gentle Steadicam float",
  },
  {
    trigger: "电影感",
    visual:
      "2.39:1 letterbox crop, 24fps, anamorphic flares, generous negative space, Kodak-style roll-off in highlights",
  },
  {
    trigger: "通透",
    visual:
      "clean specular highlights, controlled glare, no chromatic noise, crystal-clear catchlights in eyes",
  },
  {
    trigger: "细腻",
    visual:
      "macro-level skin / surface detail, micro-texture preserved, no over-smoothing",
  },
  {
    trigger: "保湿",
    aliases: ["水润"],
    visual:
      "tiny condensation beads on skin / surface, soft specular sheen, micro-droplet light play",
  },
  {
    trigger: "丝滑",
    aliases: ["柔滑"],
    visual:
      "viscous liquid pour with continuous laminar flow, slow-motion ribbon trail, no splashes",
  },
  {
    trigger: "蓬松",
    visual:
      "powder / fabric particles caught in side-light, soft volumetric body, springy bounce on contact",
  },
  {
    trigger: "持久",
    visual:
      "time-lapse beat showing the effect held over multiple cuts (morning → afternoon) with consistent finish",
  },
  {
    trigger: "提亮",
    visual:
      "after-shot brighter than before-shot under identical lighting, subtle catch-light increase on cheekbones",
  },
  {
    trigger: "防晒",
    visual:
      "UV-blocking visualization (light cones diffusing over skin), sun symbol reflected in eye, cool undertone",
  },
  {
    trigger: "轻薄",
    visual:
      "fabric / product flexed in hand showing minimal mass, breeze lifting it slightly, translucent edges",
  },
  {
    trigger: "防水",
    visual:
      "water beads rolling off the surface unabsorbed, droplets bouncing back rather than spreading",
  },
  {
    trigger: "降噪",
    visual:
      "ambient noise visualised as soft particle waves, then muted to silence as product activates",
  },
  {
    trigger: "续航",
    aliases: ["长续航"],
    visual:
      "battery indicator visible across multiple time-lapse cuts, daylight-to-night arc with device still on",
  },
  {
    trigger: "降温",
    aliases: ["凉感"],
    visual:
      "frost crystallising on the surface, breath fog appearing, temperature gauge needle dropping",
  },
  {
    trigger: "暖感",
    aliases: ["保暖"],
    visual:
      "warm steam rising, fabric hugging skin without stiffness, hands relaxing inside",
  },
  {
    trigger: "好闻",
    aliases: ["留香"],
    visual:
      "fragrance waves rendered as soft particle drift, character closing eyes for an inhale beat",
  },
  {
    trigger: "好喝",
    visual:
      "first-sip eyes-closed beat, golden swallow, condensation on glass, small smile on exhale",
  },
  {
    trigger: "脆",
    aliases: ["香脆"],
    visual:
      "snap-bite micro slow-mo with crumbs flying outward, audible crisp shard fracturing",
  },
  {
    trigger: "嫩",
    visual:
      "knife glides through with zero resistance, juices welling up, surface dimples back like silicone",
  },
  {
    trigger: "锁鲜",
    visual:
      "vacuum seal collapsing visibly on the bag, time-lapse of unchanged colour vs. uncovered control",
  },
  {
    trigger: "沉浸",
    visual:
      "noise-cancellation visualised as ambient world dimming and product close-up sharpening into focus",
  },
  {
    trigger: "解压",
    aliases: ["治愈"],
    visual:
      "ASMR-paced micro action loop (squeeze / pour / wipe), warm shallow-DOF close-up, slow exhale beat",
  },
  {
    trigger: "顺滑",
    aliases: ["顺畅"],
    visual:
      "single uninterrupted gesture from start to finish, no jitter, surface drag-mark stays continuous",
  },
  {
    trigger: "便携",
    visual:
      "product slipping into pocket / palm with room to spare, side-by-side scale comparison with a phone",
  },
];

/* ─────────── UGC mode: framework + hooks + realism presets ─────────── */

export type UgcFramework = "midfunnel-punchy" | "full-stack" | "raw-testimonial";

export const UGC_FRAMEWORKS: {
  id: UgcFramework;
  zh: { name: string; sub: string; structure: string };
  en: { name: string; sub: string; structure: string };
  /** Suggested chunk count + per-chunk runtime sec. */
  suggestedChunks: number;
  suggestedRuntime: number;
}[] = [
  {
    id: "midfunnel-punchy",
    zh: {
      name: "中段-冲击型",
      sub: "已知问题用户 · 转化最快 · 推荐",
      structure: "钩子 → 戳痛 → 方案 → 演示 → CTA",
    },
    en: {
      name: "Mid-funnel Punchy",
      sub: "Problem-aware audience · highest conversion",
      structure: "Hook → Pain → Solution → Demo → CTA",
    },
    suggestedChunks: 5,
    suggestedRuntime: 5,
  },
  {
    id: "full-stack",
    zh: {
      name: "完整教育型",
      sub: "冷流量 · 用户不知道有这问题",
      structure: "钩子 → 教育 → 反常识 → 方案 → 演示 → 证据 → CTA",
    },
    en: {
      name: "Full-Stack",
      sub: "Cold traffic · audience unaware",
      structure: "Hook → Educate → Reveal → Solution → Demo → Proof → CTA",
    },
    suggestedChunks: 7,
    suggestedRuntime: 6,
  },
  {
    id: "raw-testimonial",
    zh: {
      name: "口碑型",
      sub: "高复购品类 · 信任型转化",
      structure: "身份 → 之前的痛 → 用了 X 天后 → 推荐",
    },
    en: {
      name: "Raw Testimonial",
      sub: "High-LTV products · trust-driven",
      structure: "Identity → Old pain → After X days → Recommend",
    },
    suggestedChunks: 4,
    suggestedRuntime: 7,
  },
];

export type HookType =
  | "problem-aware"
  | "problem-unaware"
  | "social-proof"
  | "shock"
  | "question"
  | "comparison"
  | "transformation"
  | "myth-bust"
  | "story"
  | "demo";

export const HOOK_TYPES: {
  id: HookType;
  zh: { label: string; example: string };
  en: { label: string; example: string };
}[] = [
  {
    id: "problem-aware",
    zh: { label: "已知痛点", example: "如果你还在 X 还吃 Y，就是治错地方了" },
    en: { label: "Problem-aware", example: "If you still X by doing Y, you're in the wrong place" },
  },
  {
    id: "problem-unaware",
    zh: { label: "未知痛点", example: "我之前不知道 X 还能这样" },
    en: { label: "Problem-unaware", example: "I never knew X could be done this way" },
  },
  {
    id: "social-proof",
    zh: { label: "社交证明", example: "大家都在用 X 但没人说 Y" },
    en: { label: "Social proof", example: "Everyone uses X but no one mentions Y" },
  },
  {
    id: "shock",
    zh: { label: "震惊式", example: "X 是个谎言，真相是 Y" },
    en: { label: "Shock", example: "X is a lie. The truth is Y" },
  },
  {
    id: "question",
    zh: { label: "提问式", example: "你试过 X 吗？" },
    en: { label: "Question", example: "Have you tried X?" },
  },
  {
    id: "comparison",
    zh: { label: "对比式", example: "我换 X 之后和 Y 比" },
    en: { label: "Comparison", example: "After I switched to X, compared to Y..." },
  },
  {
    id: "transformation",
    zh: { label: "蜕变式", example: "X 周后我看起来完全不一样" },
    en: { label: "Transformation", example: "After X weeks I look completely different" },
  },
  {
    id: "myth-bust",
    zh: { label: "破除迷思", example: "X 是骗局，真相是 Y" },
    en: { label: "Myth-bust", example: "X is a scam. The real reason is Y" },
  },
  {
    id: "story",
    zh: { label: "故事式", example: "我那时候..." },
    en: { label: "Story", example: "Back then I..." },
  },
  {
    id: "demo",
    zh: { label: "演示式", example: "看这个质地 / 直接产品出镜动作" },
    en: { label: "Demo", example: "Look at this texture / direct product action" },
  },
];

/** Realism preset — pre-fills `universalBlocks.realismBlock`. */
export const REALISM_PRESETS: {
  id: string;
  zh: { name: string; cue: string };
  en: { name: string; cue: string };
}[] = [
  {
    id: "phone-cam-indoor",
    zh: {
      name: "📱 室内手机自拍",
      cue: "手机自拍画质，室内自然窗光，肤色保留毛孔细节，轻微镜头畸变（手机广角），浅景深但不夸张。9:16 竖版构图，画面有手持的轻微抖动。",
    },
    en: {
      name: "📱 Indoor phone selfie",
      cue: "Phone selfie quality, indoor natural window light, micro pore texture preserved, slight wide-angle lens distortion, shallow but not exaggerated DOF. 9:16 vertical, slight handheld wobble.",
    },
  },
  {
    id: "phone-cam-outdoor",
    zh: {
      name: "🌳 户外手机随拍",
      cue: "户外自然光，路人感视角，手机随手拍质感，微微过曝高光，背景有日常生活元素（路人、车辆模糊）。9:16 竖版。",
    },
    en: {
      name: "🌳 Outdoor phone candid",
      cue: "Outdoor natural light, passerby vibe, casual handheld phone aesthetic, slightly blown highlights, daily life elements in bg (blurred pedestrians/cars). 9:16 vertical.",
    },
  },
  {
    id: "vlog-mid",
    zh: {
      name: "🎥 居家 Vlog 中端",
      cue: "Vlog 风格，相机定焦人脸，柔光环境光（如台灯加补光），略微克制的构图，偶尔切到桌面 B-roll。",
    },
    en: {
      name: "🎥 Home vlog mid-tier",
      cue: "Vlog style, camera locked on face, soft ambient light (lamp + fill), slightly composed framing, occasional tabletop B-roll.",
    },
  },
  {
    id: "tiktok-quickcut",
    zh: {
      name: "⚡ 抖音快剪",
      cue: "TikTok 节奏，快速 cut 之间小变化（角度、距离、表情），手机竖屏，适度过曝，画面饱和略高。",
    },
    en: {
      name: "⚡ TikTok quick-cut",
      cue: "TikTok pacing, small variations between cuts (angle/distance/expression), vertical phone, slight overexposure, slightly saturated.",
    },
  },
];

/** Generate 10 voiceover variant suggestions for the first chunk, each using
 *  a different hook framework. Pure template-driven — no LLM call.
 *
 *  The user inputs:
 *    - `topic`: free-form description of what the product does or who it's for
 *               (e.g. "防脱发软胶囊", "便携咖啡磨豆机", "美黑油").
 *    - `painPoint` (optional): the specific symptom or struggle to hook on.
 *
 *  Returns 10 voiceover candidates the user can browse and apply with one
 *  click to chunk 1. Each candidate is paired with the hookType so the
 *  badge / submit logic stay accurate.
 */
export function generateHookVariants(
  topic: string,
  painPoint?: string,
  locale: "zh" | "en" = "zh"
): { hookType: HookType; voiceover: string }[] {
  const t = topic.trim() || (locale === "zh" ? "这个产品" : "this product");
  const p = painPoint?.trim() || (locale === "zh" ? "这个问题" : "this issue");
  if (locale === "en") {
    return [
      { hookType: "problem-aware", voiceover: `If you've been struggling with ${p} and nothing's working, you're treating the wrong thing.` },
      { hookType: "problem-unaware", voiceover: `I had no idea ${p} could actually be fixed at the root — not the surface.` },
      { hookType: "social-proof", voiceover: `Everyone is buying products for ${p}, but no one talks about what actually works.` },
      { hookType: "shock", voiceover: `90% of what you're using for ${p} doesn't actually do anything.` },
      { hookType: "question", voiceover: `Have you ever wondered why ${p} keeps coming back, no matter what you try?` },
      { hookType: "comparison", voiceover: `After I switched to ${t}, I can finally tell the difference.` },
      { hookType: "transformation", voiceover: `Three weeks with ${t}, I look completely different in the mirror.` },
      { hookType: "myth-bust", voiceover: `What they tell you about ${p} is mostly wrong. Here's what actually helps.` },
      { hookType: "story", voiceover: `A few months ago I was dealing with ${p} every single morning, until I found ${t}.` },
      { hookType: "demo", voiceover: `Look at this — this is what ${t} does in 5 seconds.` },
    ];
  }
  // Chinese (default)
  return [
    {
      hookType: "problem-aware",
      voiceover: `如果你一直在为${p}发愁，吃啥用啥都没用，那是因为你治错地方了。`,
    },
    {
      hookType: "problem-unaware",
      voiceover: `我之前完全不知道${p}居然能从根上解决，不是表面那种。`,
    },
    {
      hookType: "social-proof",
      voiceover: `大家都在买治${p}的东西，但没人讲到底什么才真正有用。`,
    },
    {
      hookType: "shock",
      voiceover: `你用的 9 成治${p}的产品其实压根没用。`,
    },
    {
      hookType: "question",
      voiceover: `你有没有想过为什么${p}怎么治都反复？`,
    },
    {
      hookType: "comparison",
      voiceover: `换了 ${t} 之后，跟我之前用的对比，差距太明显了。`,
    },
    {
      hookType: "transformation",
      voiceover: `用 ${t} 三周，照镜子完全是另一个人。`,
    },
    {
      hookType: "myth-bust",
      voiceover: `大家都说${p}靠 XX 就能解决，其实根本是骗人的。真相是 ${t}。`,
    },
    {
      hookType: "story",
      voiceover: `几个月前我每天都被${p}折腾，直到我发现了 ${t}。`,
    },
    {
      hookType: "demo",
      voiceover: `看这个 — ${t}，五秒钟你就懂了。`,
    },
  ];
}

/** Generate full chunk scaffold from a framework + one-line brief.
 *
 *  Used by the "🚀 生成 N 段" CTA in UGC mode. Pure template fill — no LLM
 *  call. Each framework has hand-tuned voiceover + framing beats matching
 *  its structure. Users edit/refine after generation.
 *
 *  Inputs:
 *    - framework:    which structure to scaffold (decides chunk count + runtime)
 *    - brief:        one-line core ask ("跑鞋电商广告，突出缓震科技")
 *    - productHint:  optional product reference name to weave in ("这款 X")
 *
 *  Returns chunks ready to drop into `cur.chunks`.
 */
export function generateChunksFromBrief(
  framework: UgcFramework,
  brief: string,
  opts: { productHint?: string; locale?: "zh" | "en" } = {}
): {
  index: number;
  voiceover: string;
  framing: string;
  includeProduct: boolean;
  runtime: number;
  hookType?: HookType;
}[] {
  const zh = opts.locale !== "en";
  const b = brief.trim() || (zh ? "这件事" : "this");
  const ph = opts.productHint?.trim() || (zh ? "这款产品" : "this product");
  const fw = UGC_FRAMEWORKS.find((f) => f.id === framework);
  if (!fw) return [];
  const rt = fw.suggestedRuntime;

  /** Runtime is auto-fitted to the actual voiceover length (estimateRuntime
   *  ≈ 3 zh chars/sec) rather than the framework's default. This kills the
   *  "偏长 — 推荐 11s 你设了 5s" warning that fired on every generated chunk
   *  in the old version, and gives the timeline visual rhythm matching how
   *  long each line really takes to speak. */
  const fitRuntime = <T extends { voiceover: string; runtime: number }>(
    beats: T[]
  ): T[] => beats.map((c) => ({ ...c, runtime: estimateRuntime(c.voiceover) }));

  if (framework === "midfunnel-punchy") {
    return fitRuntime(zh
      ? [
          { index: 1, voiceover: `如果你还在为${b}烦恼，那真不是你没努力，是方向错了。`, framing: "中近景，confiding 语气，直视镜头", includeProduct: false, runtime: rt, hookType: "problem-aware" },
          { index: 2, voiceover: `我也试过很多办法，效果都不持久，每次都是这样。`, framing: "侧脸 3/4，皱眉回忆神情", includeProduct: false, runtime: rt },
          { index: 3, voiceover: `直到我换了${ph}，整个状态完全不一样了。`, framing: "中景，产品自然在手里，介绍口吻", includeProduct: true, runtime: rt },
          { index: 4, voiceover: `你看这个用法，三秒搞定，每天都用得上。`, framing: "近景 + 桌面 B-roll，产品 + 手部动作", includeProduct: true, runtime: rt },
          { index: 5, voiceover: `评论区 #1 我把链接发给你，先试试再说。`, framing: "面对镜头，热情邀请，自然手势", includeProduct: false, runtime: rt },
        ]
      : [
          { index: 1, voiceover: `If you're still struggling with ${b}, it's not your effort — it's the wrong direction.`, framing: "Medium close-up, confiding tone, eye contact", includeProduct: false, runtime: rt, hookType: "problem-aware" },
          { index: 2, voiceover: `I tried so many things, none lasted. Same loop every time.`, framing: "3/4 profile, slight frown, reflective", includeProduct: false, runtime: rt },
          { index: 3, voiceover: `Then I switched to ${ph}, and everything changed.`, framing: "Medium shot, product naturally in hand, candid", includeProduct: true, runtime: rt },
          { index: 4, voiceover: `Look at this — 3 seconds and it's done. I use it daily.`, framing: "Close-up + tabletop B-roll, product + hands", includeProduct: true, runtime: rt },
          { index: 5, voiceover: `Drop "1" in the comments — I'll DM you the link.`, framing: "Face camera, warm invitation, natural gesture", includeProduct: false, runtime: rt },
        ]);
  }

  if (framework === "full-stack") {
    return fitRuntime(zh
      ? [
          { index: 1, voiceover: `你可能不知道，${b}这事其实大部分人都搞错了方向。`, framing: "中近景，惊讶表情开场", includeProduct: false, runtime: rt, hookType: "problem-unaware" },
          { index: 2, voiceover: `大家都以为问题在 X，但根源其实在另一个地方。`, framing: "正面，讲解口吻，手势辅助", includeProduct: false, runtime: rt },
          { index: 3, voiceover: `我研究了挺久才搞明白，关键是 Y。`, framing: "侧脸思考，环境光，舒缓节奏", includeProduct: false, runtime: rt },
          { index: 4, voiceover: `所以我现在用的就是${ph}，从根上解决。`, framing: "中景，产品在手，介绍口吻", includeProduct: true, runtime: rt },
          { index: 5, voiceover: `你看这个效果，是不是完全不一样了。`, framing: "近景 + B-roll，产品演示", includeProduct: true, runtime: rt },
          { index: 6, voiceover: `用了两周，每天早上对比都能看到变化。`, framing: "对比镜头，自然光，肯定语气", includeProduct: false, runtime: rt },
          { index: 7, voiceover: `想试的评论区告诉我，我把链接整理出来。`, framing: "面对镜头，邀请手势", includeProduct: false, runtime: rt },
        ]
      : [
          { index: 1, voiceover: `You probably don't know this — most people get ${b} completely wrong.`, framing: "Medium close-up, opening with surprise", includeProduct: false, runtime: rt, hookType: "problem-unaware" },
          { index: 2, voiceover: `Everyone thinks the problem is X. The real root is somewhere else.`, framing: "Front-facing, explainer tone, supportive hand gestures", includeProduct: false, runtime: rt },
          { index: 3, voiceover: `It took me a while to figure out it actually comes down to Y.`, framing: "3/4 thinking pose, ambient light, slow pace", includeProduct: false, runtime: rt },
          { index: 4, voiceover: `That's why I now use ${ph} — it fixes the root, not the surface.`, framing: "Medium shot, product in hand, candid intro", includeProduct: true, runtime: rt },
          { index: 5, voiceover: `Look at this — completely different result.`, framing: "Close-up + B-roll, product demo", includeProduct: true, runtime: rt },
          { index: 6, voiceover: `Two weeks in, I see a difference in the mirror every morning.`, framing: "Side-by-side compare, natural light, assured", includeProduct: false, runtime: rt },
          { index: 7, voiceover: `Drop a comment if you want it — I'll put the link together.`, framing: "Face camera, inviting gesture", includeProduct: false, runtime: rt },
        ]);
  }

  // raw-testimonial
  return fitRuntime(zh
    ? [
        { index: 1, voiceover: `我是 [自我介绍]，被${b}困扰了好几年。`, framing: "中近景，自然光，平静开场", includeProduct: false, runtime: rt, hookType: "story" },
        { index: 2, voiceover: `之前各种方法都试过，钱也花了不少，效果都不持久。`, framing: "侧脸，回忆神情，柔光", includeProduct: false, runtime: rt },
        { index: 3, voiceover: `直到我开始用${ph}，差不多到第 X 天的时候真的有了变化。`, framing: "中景，产品自然入镜，肯定语气", includeProduct: true, runtime: rt },
        { index: 4, voiceover: `所以如果你也在为这事烦，真心推荐你也试试。`, framing: "面对镜头，温和推荐，自然眨眼", includeProduct: false, runtime: rt },
      ]
    : [
        { index: 1, voiceover: `Hey — I'm [name], and I struggled with ${b} for years.`, framing: "Medium close-up, natural light, calm opening", includeProduct: false, runtime: rt, hookType: "story" },
        { index: 2, voiceover: `I tried everything, spent a lot. Nothing held.`, framing: "Profile, reflective, soft light", includeProduct: false, runtime: rt },
        { index: 3, voiceover: `Then I started using ${ph} — around day X, things actually shifted.`, framing: "Medium shot, product naturally in frame, assured", includeProduct: true, runtime: rt },
        { index: 4, voiceover: `So if you're dealing with this too — honestly, give it a try.`, framing: "Face camera, warm recommendation, natural blinks", includeProduct: false, runtime: rt },
      ]);
}

/** Estimate runtime (seconds) for a Chinese voiceover by character count.
 *  Heuristic: ~3 chars/sec for natural conversational pace. */
export function estimateRuntime(voiceover: string): number {
  const t = (voiceover || "").trim();
  if (!t) return 0;
  // Treat each Chinese char + each English word as 1 unit
  const chineseChars = (t.match(/[一-鿿]/g) || []).length;
  const englishWords = (t.match(/[a-zA-Z]+/g) || []).length;
  // 3 zh chars/s, 2.5 en words/s — average to seconds
  const sec = chineseChars / 3 + englishWords / 2.5;
  return Math.max(3, Math.min(12, Math.round(sec)));
}

/** Look up a phrase against the dictionary; returns the visual anchor or null. */
export function lookupSellingPointAnchor(phrase: string): string | null {
  const t = phrase.trim();
  if (!t) return null;
  for (const entry of SELLING_POINT_ANCHORS) {
    if (entry.trigger === t) return entry.visual;
    if (entry.aliases?.includes(t)) return entry.visual;
  }
  // Loose match — the user wrote "显瘦的衣服" → still match "显瘦".
  for (const entry of SELLING_POINT_ANCHORS) {
    if (t.includes(entry.trigger)) return entry.visual;
    if (entry.aliases?.some((a) => t.includes(a))) return entry.visual;
  }
  return null;
}
