/**
 * R2V 字段标签字典 — 共享版
 *
 * 所有「id ↔ 中英文标签」的映射都在这里维护，避免 Card1（下拉选项）和
 * Card2（buildConfigSummary 中翻译 id 为可读文本）两处重复定义、互相不同步。
 *
 * 同时导出两种访问形式：
 *  • XXX_OPTIONS：array，供 Card1 渲染下拉/复选用
 *  • labelOf(options, id, zh)：辅助函数，供 Card2 翻译 id 用
 */

import type { RoleKind } from "./schema";

export type LabeledOption<T extends string = string> = {
  id: T;
  zh: string;
  en: string;
};

/** Reference image role（角色/模特/产品...） */
export const ROLE_OPTIONS: LabeledOption<RoleKind>[] = [
  { id: "character", zh: "角色/模特", en: "Character" },
  { id: "product", zh: "产品主图", en: "Product hero" },
  { id: "product-detail", zh: "产品细节", en: "Detail shot" },
  { id: "product-inuse", zh: "使用场景", en: "In-use" },
  { id: "effect", zh: "效果展示", en: "Effect" },
  { id: "texture", zh: "材质/质感", en: "Texture" },
  { id: "scene", zh: "场景背景", en: "Scene" },
  { id: "style", zh: "风格色调", en: "Style ref" },
  { id: "prop", zh: "道具", en: "Prop" },
  { id: "outfit", zh: "服装", en: "Outfit" },
  { id: "packaging", zh: "包装", en: "Packaging" },
  { id: "logo", zh: "Logo", en: "Logo" },
  { id: "other", zh: "其他", en: "Other" },
];

/** 内容方向 */
export const CONTENT_DIRECTION_OPTIONS: LabeledOption[] = [
  { id: "luxury", zh: "Luxury 品牌广告", en: "Luxury brand ad" },
  { id: "ecommerce", zh: "电商产品广告", en: "E-commerce product ad" },
  { id: "emotional", zh: "真人情感短片", en: "Emotional short" },
  { id: "ugc", zh: "UGC 真实感", en: "UGC authentic" },
  { id: "cartoon", zh: "卡通/动漫", en: "Cartoon / Anime" },
  { id: "landscape", zh: "风景/抽象", en: "Landscape / Abstract" },
  { id: "action", zh: "动作戏", en: "Action" },
];

/** 场景类型（R2V 四种写法） */
export const SCENE_TYPE_OPTIONS: LabeledOption[] = [
  { id: "single-multi-angle", zh: "单主体多角度", en: "Single multi-angle" },
  { id: "subject-scene", zh: "主体+场景", en: "Subject + scene" },
  { id: "multi-subject", zh: "多主体交互", en: "Multi-subject" },
  { id: "storyboard", zh: "剧情分镜", en: "Storyboard" },
];

/** 电商品类 — Card1 提供这 6 个让用户选；Card2 翻译时还会遇到从其他字段联动出来的 id（如 luxury/ugc/general），见 ECOM_CATEGORY_ALIASES */
export const ECOM_CATEGORY_OPTIONS: LabeledOption[] = [
  { id: "beauty", zh: "🧴 美妆护肤", en: "🧴 Beauty" },
  { id: "apparel", zh: "👗 服装配饰", en: "👗 Apparel" },
  { id: "digital", zh: "📱 数码电子", en: "📱 Digital" },
  { id: "food", zh: "🍰 食品饮料", en: "🍰 Food" },
  { id: "home", zh: "🛋 家居用品", en: "🛋 Home" },
  { id: "sports", zh: "🏃 运动户外", en: "🏃 Sports" },
];

/** 翻译用补充——非 Card1 直接下拉，但 Card2 摘要时可能见到这些 id */
const ECOM_CATEGORY_ALIASES: LabeledOption[] = [
  { id: "luxury", zh: "💎 奢侈品", en: "💎 Luxury" },
  { id: "ugc", zh: "📱 UGC", en: "📱 UGC" },
  { id: "general", zh: "通用", en: "General" },
];

/** 技术要求 */
export const TECH_DETAIL_OPTIONS: LabeledOption[] = [
  { id: "voice", zh: "配音", en: "Voice-over" },
  { id: "text-overlay", zh: "文字浮现", en: "Text overlay" },
  { id: "pack-shot", zh: "Pack shot", en: "Pack shot" },
  { id: "real-person", zh: "真人模特", en: "Real person" },
];

/** 输出比例 */
export const RATIO_OPTIONS: LabeledOption[] = [
  { id: "16:9", zh: "16:9 横版", en: "16:9 Landscape" },
  { id: "9:16", zh: "9:16 竖版", en: "9:16 Portrait" },
  { id: "1:1", zh: "1:1 方形", en: "1:1 Square" },
  { id: "4:3", zh: "4:3", en: "4:3" },
];

/* ─────────── 翻译 helper ─────────── */

/** 在 options 数组里按 id 查 label，找不到返回 id 本身 */
export function labelOf(
  options: LabeledOption[],
  id: string | undefined | null,
  zh: boolean
): string {
  if (!id) return "";
  const o = options.find((x) => x.id === id);
  return o ? (zh ? o.zh : o.en) : id;
}

/** 角色 label（含 fallback） */
export function roleLabel(id: string | undefined | null, zh: boolean): string {
  return labelOf(ROLE_OPTIONS as LabeledOption[], id, zh);
}

/** 内容方向 label */
export function directionLabel(id: string | undefined | null, zh: boolean): string {
  return labelOf(CONTENT_DIRECTION_OPTIONS, id, zh);
}

/** 场景类型 label */
export function sceneTypeLabel(id: string | undefined | null, zh: boolean): string {
  return labelOf(SCENE_TYPE_OPTIONS, id, zh);
}

/** 电商品类 label —— 同时查主表和别名表 */
export function categoryLabel(id: string | undefined | null, zh: boolean): string {
  if (!id) return "";
  return labelOf([...ECOM_CATEGORY_OPTIONS, ...ECOM_CATEGORY_ALIASES], id, zh);
}

/** 技术要求 label */
export function techDetailLabel(id: string | undefined | null, zh: boolean): string {
  return labelOf(TECH_DETAIL_OPTIONS, id, zh);
}

/** 比例 label */
export function ratioLabel(id: string | undefined | null, zh: boolean): string {
  return labelOf(RATIO_OPTIONS, id, zh);
}
