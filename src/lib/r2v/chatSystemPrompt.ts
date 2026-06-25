/**
 * R2V AI 扩写 — 客户端轻量版
 *
 * 仅包含类型定义、格式化函数和模块元数据。
 * 重量级知识库内容在 chatSystemPromptServer.ts（仅 API route 引用）。
 */

export type SkillModule = {
  id: string;
  label: string;
  labelEn: string;
  desc: string;
  descEn: string;
};

export type PromptStyle = "detailed" | "concise";

export type R2VConfig = {
  isEcommerce?: boolean;
  includeTemplates?: boolean;
  disabledModules?: string[];
  customInstructions?: string;
  promptStyle?: PromptStyle;
  /** 场景预设 id（见 promptPresets.ts），决定场景化写作规则 */
  preset?: string;
  /**
   * 用户的核心需求原文。直接注入 system prompt 顶部作为最高优先级硬约束。
   * 不经过 user message 摘要，避免被淹没。
   */
  coreNeed?: string;
};

const ALWAYS_MODULES: SkillModule[] = [
  { id: "r2v-guide", label: "R2V 指南", labelEn: "R2V Guide", desc: "完整 R2V 生成指南、4种写法、参考图规则", descEn: "Full R2V guide, 4 writing patterns, reference rules" },
  { id: "camera", label: "运镜词典", labelEn: "Camera Dict", desc: "50+ 运镜术语与示例", descEn: "50+ camera movement terms & examples" },
  { id: "checklist", label: "优化清单", labelEn: "Checklist", desc: "Prompt 质量自检 20 项", descEn: "20-point prompt quality checklist" },
  { id: "negative", label: "Negative 库", labelEn: "Negatives", desc: "常用排除项分类汇编", descEn: "Categorized negative prompt library" },
];

/**
 * 返回即将加载的知识模块元数据（用于 UI 徽章展示）。
 * 不包含实际内容 — 内容由服务端注入。
 */
export function getModulesMeta(config: R2VConfig): SkillModule[] {
  const modules = [...ALWAYS_MODULES];
  if (config.isEcommerce) {
    modules.push({ id: "ecommerce", label: "电商模板", labelEn: "E-com Templates", desc: "电商品类专属 Prompt 模板", descEn: "E-commerce category-specific templates" });
  }
  if (config.includeTemplates) {
    modules.push({ id: "templates", label: "Prompt 模板", labelEn: "Prompt Templates", desc: "通用 Prompt 模板库", descEn: "General-purpose prompt template library" });
  }
  return modules;
}

/**
 * 把 R2V 项目配置格式化为用户初始消息。
 * 采用「任务清单」格式而非自然语言——模型对 checklist 的执行率远高于段落描述。
 */
export function formatConfigAsUserMessage(config: string): string {
  return `# 你的生成任务

下面是项目配置。请把配置的**每一项**翻译成提示词中的具体动作，并在末尾通过 [自检] 段落逐项核对。

## 行动准则（执行清单，全部完成才可输出）
[ ] 把「核心需求」中提到的每一个要素映射到具体镜头
[ ] 为每张参考图【图N】安排一个专属聚焦镜头（≥1 秒，作为该镜头主体）
[ ] 每张参考图的备注/描述要落实为镜头中的可见物理细节
[ ] 镜头时长之和 = 配置中「输出设置 → 时长」（精确匹配，不多不少）
[ ] 把「技术要求」逐项落实到具体镜头/段落
[ ] 把「必须保留」中的每一项体现在提示词中
[ ] 在末尾生成 [Negative] 段落，覆盖「禁止出现」中的每一项
[ ] 在末尾生成 [自检] 段落，逐条勾选上述 7 项是否完成

---

## 项目配置

${config}

---

## 输出格式（严格遵守）

[一句话场景概述]

【镜头1 | 景别/视角 | 运镜 | Ns】
[详细描述]

【镜头2 | …】
…

[Anchor Details]
- 跨镜头一致性锚点

[Negative]
- 排除项（逐项展开自「禁止出现」）

[自检]
✓ 核心需求"XXX" → 镜头 N
✓ 【图1】镜头 N / 【图2】镜头 N / ...（每张图的专属镜头）
✓ 时长合计 = X+Y+Z = 总时长 s
✓ 必须保留：XXX → 镜头 N
✓ 技术要求：XXX → 落地方式
✓ Negative 已覆盖配置项

可直接复制粘贴使用，不需要二次编辑。`;
}
