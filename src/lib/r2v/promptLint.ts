/**
 * R2V Prompt 输出 Lint — 客户端兜底校验
 *
 * AI 生成完不要直接信，用代码逐条核对：
 *  1. 输出末尾是否有 [自检] 段
 *  2. 镜头时长加和是否 = 配置时长
 *  3. 每张参考图【图N】至少出现一次
 *  4. [Negative] 段是否覆盖了配置的所有禁止项
 *  5. [Anchor Details] 段是否存在
 *
 * 不达标的 issue 可以一键反馈给 AI 让它修正。
 */

export type LintIssue = {
  /** 内部 id，方便去重 */
  id: string;
  /** 严重程度：error 阻断 / warn 提醒 */
  severity: "error" | "warn";
  /** 中文一句话描述 */
  message: string;
  /** 用于给 AI 修复的指令片段 */
  fixInstruction: string;
};

/**
 * 把 lint issue id 映射到 HH Guide 的章节锚点。
 * 用户点击 lint 报错条上的"📖 看指南"时跳到精准位置。
 */
export function guideAnchorForIssue(issueId: string): string {
  const map: Record<string, string> = {
    "no-self-check": "checklist",
    "no-negative": "ecom",
    "negative-incomplete": "ecom",
    "no-anchor": "formula",
    "missing-refs": "modes",
    "duration-mismatch": "boundary",
    "coreneed-antonym": "ecom",
  };
  return map[issueId] ?? "overview";
}

export type LintInput = {
  /** AI 输出的完整文本 */
  text: string;
  /** 配置的总时长（秒） */
  expectedDuration?: number;
  /** 参考图数量 */
  refCount?: number;
  /** 配置中的禁止项 id 列表 */
  excludes?: string[];
  /** 配置中的核心需求原文（用于关键词召回检查） */
  coreNeed?: string;
};

/**
 * 高确定性反义词组——core need 出现左侧词时，prompt 必须出现左侧词或同义词，
 * 且不能出现右侧的反义词。
 * 仅覆盖时间/光线/天气这类语义明确的二元词，避免误判。
 */
const ANTONYM_GROUPS: Array<{
  category: string;
  positive: string[];
  negative: string[];
}> = [
  {
    category: "光线/时间",
    positive: ["夕阳", "黄昏", "日落", "晚霞", "暮色", "夕照"],
    negative: ["清晨", "早晨", "晨光", "晨雾", "黎明", "上午"],
  },
  {
    category: "光线/时间",
    positive: ["清晨", "早晨", "晨光", "晨雾", "黎明"],
    negative: ["夕阳", "黄昏", "日落", "晚霞", "暮色"],
  },
  {
    category: "光线/时间",
    positive: ["夜晚", "深夜", "夜色", "夜间", "凌晨"],
    negative: ["白天", "正午", "中午", "日间", "阳光明媚"],
  },
  {
    category: "光线/时间",
    positive: ["正午", "白天", "日间", "阳光明媚"],
    negative: ["夜晚", "深夜", "夜色", "凌晨"],
  },
  {
    category: "天气",
    positive: ["雨", "湿", "下雨", "雨滴", "雨水"],
    negative: ["晴天", "干燥", "无云", "万里无云"],
  },
  {
    category: "天气",
    positive: ["雪", "下雪", "雪花", "雪地"],
    negative: ["夏日", "盛夏", "炎热"],
  },
  {
    category: "季节",
    positive: ["冬天", "冬日", "寒冬", "严寒"],
    negative: ["夏日", "盛夏", "炎热", "酷暑"],
  },
];

/** 主入口 */
export function lintPromptOutput(input: LintInput): LintIssue[] {
  const issues: LintIssue[] = [];
  const text = input.text || "";

  // 1. [自检] 段
  if (!/\[自检\]/.test(text) && !/\[Self-Check\]/i.test(text)) {
    issues.push({
      id: "no-self-check",
      severity: "error",
      message: "缺少 [自检] 段——AI 没自我核对，质量不可信",
      fixInstruction: "请在输出末尾追加 [自检] 段，逐条勾选 7 项核心约束。",
    });
  }

  // 2. [Negative] 段
  if (!/\[Negative\]/i.test(text)) {
    issues.push({
      id: "no-negative",
      severity: "error",
      message: "缺少 [Negative] 段——所有「禁止出现」项未展开",
      fixInstruction: "请在输出末尾追加 [Negative] 段，把配置中「禁止出现」的每一项展开为具体排除指令。",
    });
  } else if (input.excludes && input.excludes.length > 0) {
    // 检查 Negative 段是否覆盖了所有 excludes
    const negSection = extractSection(text, "Negative");
    if (negSection) {
      const missing = input.excludes.filter((ex) => {
        // 简单的关键词匹配——把 kebab-case 拆开看
        const keywords = ex.split(/[-_]/);
        return !keywords.every((kw) => negSection.toLowerCase().includes(kw.toLowerCase()));
      });
      if (missing.length > 0) {
        issues.push({
          id: "negative-incomplete",
          severity: "warn",
          message: `[Negative] 段未覆盖：${missing.join(", ")}`,
          fixInstruction: `[Negative] 段必须补齐以下排除项：${missing.join(", ")}`,
        });
      }
    }
  }

  // 3. [Anchor Details] 段
  if (!/\[Anchor Details\]/i.test(text) && !/\[锚点详情\]/.test(text)) {
    issues.push({
      id: "no-anchor",
      severity: "warn",
      message: "缺少 [Anchor Details] 段——跨镜头一致性细节未声明",
      fixInstruction: "请在 [Negative] 前追加 [Anchor Details] 段，列出跨镜头一致性锚点（角色长相/材质/光线方向等）。",
    });
  }

  // 4. 参考图全引用
  if (input.refCount && input.refCount > 0) {
    const missingRefs: number[] = [];
    for (let i = 1; i <= input.refCount; i++) {
      const re = new RegExp(`【图${i}】|【Image ${i}】`);
      if (!re.test(text)) missingRefs.push(i);
    }
    if (missingRefs.length > 0) {
      issues.push({
        id: "missing-refs",
        severity: "error",
        message: `参考图未全部引用，缺：${missingRefs.map((n) => `【图${n}】`).join("、")}`,
        fixInstruction: `必须在提示词中至少各一次引用 ${missingRefs.map((n) => `【图${n}】`).join("、")}，并安排专属聚焦镜头展示该图。`,
      });
    }
  }

  // 5. 核心需求关键词召回（反义词检测）
  // 如果 coreNeed 出现某组的"正向词"，但 prompt 既无该组任何正向词、又出现反义词 → 跑偏
  if (input.coreNeed && input.coreNeed.trim()) {
    const need = input.coreNeed;
    const out = text;
    const conflicts: string[] = [];
    for (const group of ANTONYM_GROUPS) {
      const needHasPositive = group.positive.some((w) => need.includes(w));
      if (!needHasPositive) continue;
      const outHasPositive = group.positive.some((w) => out.includes(w));
      const outHasNegative = group.negative.some((w) => out.includes(w));
      if (outHasNegative && !outHasPositive) {
        const usedNeg = group.negative.find((w) => out.includes(w));
        const expected = group.positive.find((w) => need.includes(w));
        conflicts.push(`${group.category}：核心需求要"${expected}"，但提示词写了"${usedNeg}"`);
      }
    }
    if (conflicts.length > 0) {
      issues.push({
        id: "coreneed-antonym",
        severity: "error",
        message: `核心需求关键词被擅自替换为反义词：${conflicts.join("；")}`,
        fixInstruction: `严格按核心需求原文写：${conflicts.join("；")}。把跑偏的描述全部改回原文要求的关键词或其同义词。`,
      });
    }
  }

  // 6. 镜头时长加和
  if (input.expectedDuration && input.expectedDuration > 0) {
    const shotDurations = extractShotDurations(text);
    if (shotDurations.length > 0) {
      const sum = shotDurations.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - input.expectedDuration) > 0.5) {
        issues.push({
          id: "duration-mismatch",
          severity: "error",
          message: `镜头时长加和 ${sum}s ≠ 配置时长 ${input.expectedDuration}s`,
          fixInstruction: `所有镜头时长之和必须精确等于 ${input.expectedDuration}s，当前为 ${sum}s（${shotDurations.join("+")}）。请调整镜头时长重新分配。`,
        });
      }
    }
  }

  return issues;
}

/** 抽取镜头时长（"3s" / "4 秒" / "2.5s"） */
function extractShotDurations(text: string): number[] {
  // 匹配 【镜头N | ... | ... | Ns】 中的 Ns
  const re = /【镜头\d+[^】]*\|\s*([\d.]+)\s*s?\s*】/g;
  const result: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseFloat(m[1]);
    if (!isNaN(n)) result.push(n);
  }
  return result;
}

/** 抽取某个段落（[XXX] 之后到下一个 [YYY] 或结尾） */
function extractSection(text: string, name: string): string | null {
  const re = new RegExp(`\\[${name}[^\\]]*\\]([\\s\\S]*?)(?=\\n\\[|$)`, "i");
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

/**
 * 把多个 issue 拼成给 AI 的"一键修正"指令。
 */
export function issuesToFollowUp(issues: LintIssue[]): string {
  if (issues.length === 0) return "";
  const lines = ["请基于以下 lint 反馈修正上述提示词，输出完整修正版（不要只给 diff）："];
  issues.forEach((i, idx) => {
    lines.push(`${idx + 1}. ${i.fixInstruction}`);
  });
  return lines.join("\n");
}
