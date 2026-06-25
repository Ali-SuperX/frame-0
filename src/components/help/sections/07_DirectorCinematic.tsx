import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";
import { SpecTable } from "../ui/SpecTable";
import { CodeBlock } from "../ui/CodeBlock";

export function Sec07DirectorCinematic() {
  return (
    <HelpSection id="director-cinematic" no="07" title="单镜大片（Cinematic）" group="导演台 R2V">
      <p className="lead">
        🎬 单镜大片（Cinematic）— <strong>单条精品 hero 视频</strong>。
        目标：品牌广告 / 高端电商 / 创意短片，强调电影质感、节奏控制、视觉锚定。
        典型成片 5–15 秒。
      </p>

      <H3 id="cinematic-card1">Card 1 · 结构化输入</H3>
      <p>
        Card 1 是导演台的&quot;素材集&quot;面板，1100+ 行核心组件。包含以下区块：
      </p>

      <SpecTable
        headers={["区块", "字段", "说明"]}
        rows={[
          ["参考图", "1–9 张 + role 字段",
           "13 种 role: character / product / scene / style / outfit / logo / prop / effect / packaging / pattern / pose / lighting / camera"],
          ["VL 描述", "Qwen 3 VL Plus/Flash 自动生成",
           "点单张图 → 自动生成 prompt 友好的描述，省得你手写"],
          ["5 要素 (Verum)", "character / identity / outfit / environment / vibe",
           "结构化锁定主体身份，避免镜头间漂移"],
          ["卖点", "抽象词 + 自动锚点",
           "输入 &quot;显瘦&quot;/&quot;丝滑&quot; → lookupSellingPointAnchor() 翻译成视觉描述"],
          ["基础参数", "时长 / 比例 / 输出分辨率 / 水印", "都是百炼协议要求的硬参数"],
          ["进阶字段", "品牌 / 必保步骤 / 平台 / 技术细节",
           "可选，但建议至少填品牌（影响视觉调性）"],
        ]}
      />

      <H3 id="cinematic-five">五要素详解（Verum 框架）</H3>
      <p>5 要素是 单镜大片跨镜头一致性的<strong>核心约束</strong>。每个要素一句话：</p>
      <SpecTable
        headers={["要素", "含义", "示例"]}
        colWidths={["18%", "32%", "50%"]}
        rows={[
          ["character", "主角的视觉描述（不是名字）", "亚洲女性，25岁，长直发，瓜子脸，眼角微挑"],
          ["identity", "主角的身份 / 职业 / 气质", "都市白领，独立自信，刚下班的疲惫感"],
          ["outfit", "服装 / 配饰具体描述", "黑色羊毛大衣，灰色高领毛衣，银色耳钉"],
          ["environment", "场景环境（不只是地点）", "黄昏的上海外滩，雨后湿润的石板路，远景陆家嘴霓虹"],
          ["vibe", "情绪基调 / 镜头感", "电影感冷调，光晕柔焦，宁静中带忧郁"],
        ]}
      />

      <H3 id="cinematic-card2">Card 2 · Prompt 生成</H3>
      <p>
        Card 2 是 1400+ 行的&quot;AI 流式扩写&quot;面板。把 Card 1 的结构化输入翻译成 R2V 模型友好的最终 prompt。
        核心组件：
      </p>
      <ul>
        <li><strong>配置条</strong> — 选 LLM（qwen3.6-plus / deepseek-v4-pro 等）+ Preset 摘要 + 配置编辑</li>
        <li><strong>34 个场景 preset</strong> — 卡片网格，按 tag 过滤（电商 / 叙事 / 风格化 / 功能型 / 生活流 / 节日营销 / 通用）</li>
        <li><strong>知识模块挂载</strong> — 每个 preset 自动挂 r2v-guide / camera / checklist / negative / ecommerce / templates 等</li>
        <li><strong>AI 流式扩写</strong> — streamChat 把配置 + 知识 + brief 喂给 LLM，结果流式回写</li>
        <li><strong>Prompt history</strong> — 每次生成入库，可回滚</li>
      </ul>

      <H3 id="cinematic-presets">34 个 Preset 速览</H3>
      <SpecTable
        headers={["分类 (数量)", "Preset"]}
        rows={[
          ["🎯 官方最佳实践 (2)", "hh-official / hh-drama"],
          ["🛒 电商 (10)", "ecom-punch / ecom-luxury / ecom-ugc / beauty-macro / apparel-runway / food-asmr / digital-tech / home-lifestyle / baby-mom / automotive"],
          ["🎬 叙事 (5)", "cinematic / seedance-style / emotional / mystery-dark / healing"],
          ["✨ 风格化 (7)", "anime / cartoon / cyberpunk / retro-film / steampunk / minimal / artistic-oil"],
          ["🔬 功能型 (2)", "macro-product / talking-head"],
          ["📕 生活流 (4)", "food-vlog / travel-destination / fitness / xhs-vlog"],
          ["🧧 节日营销 (3)", "festival-cny / festival-xmas / double-11"],
          ["🎲 通用 (1)", "auto (让 LLM 自己判断)"],
        ]}
      />
      <Callout type="warn" title="Preset 不是现成 prompt">
        <p>
          34 个 preset 是 <strong>&quot;AI 生成配置捆绑包&quot;</strong> —— 选了之后还是要走 streamChat 流式生成
          才能出最终 prompt 文本。它定义的是&quot;告诉 LLM 怎么写&quot;，不是直接给你一段写好的 prompt。
          想要现成模板（一键填入即可），请参考<a href="#prompt-guide">提示词指南</a>章节。
        </p>
      </Callout>

      <H3 id="cinematic-card3">Card 3 · 视频生成</H3>
      <p>
        Cinematic 单镜流程相对简单：
      </p>
      <CodeBlock>
{`Card 3 提交流程:
  1. 选模型 (默认 happyhorse-1.0-r2v)
  2. 拼装 reference_urls + final prompt
  3. submitJobRequest() → 进任务队列
  4. 轮询 + 自动 ingest 到项目 videos/
  5. 不够长? → 见 09 长视频链式生成`}
      </CodeBlock>

      <H3 id="cinematic-flow">完整工作流（Cinematic）</H3>
      <CodeBlock title="高端品牌 Cinematic 典型路径">
{`导演台 ─→ 切 🎬 单镜大片
   ↓
Card 1: 角色参考图 + 5 要素锁定 + 抽象卖点 + 风格 preset
   ↓
Card 2: 选 hh-official 预设 → AI 流式扩写 prompt
        (或复制 /r2v <id> 到 Claude Code 用 skill 生成)
   ↓
Card 3: 单镜 happyhorse-1.0-r2v 提交 → 15s 精品
   ↓
不够长? ContinuationChainPanel 链式延续:
  r2v-chain / i2v-bridge / hybrid 三种锚点策略选一种
   ↓
最终视频入档案，Editor 剪辑成片`}
      </CodeBlock>
    </HelpSection>
  );
}
