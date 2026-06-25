import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";
import { SpecTable } from "../ui/SpecTable";
import { CodeBlock } from "../ui/CodeBlock";

export function Sec08DirectorUGC() {
  return (
    <HelpSection id="director-ugc" no="08" title="批量短片（UGC）" group="导演台 R2V">
      <p className="lead">
        📱 批量短片（UGC）—— <strong>多 chunk 量产 UGC 投流广告</strong>。
        典型 5–7 段 × 6 秒，每段带独立 voiceover 和 framing，并行跑、批量后期、一次性出片。
        跨境电商投流团队的主力工作流。
      </p>

      <H3 id="ugc-when">什么时候用 UGC</H3>
      <ul>
        <li>有<strong>真人模特</strong>或<strong>产品图</strong>需要变成 30 秒以上的投流广告</li>
        <li>需要 <strong>批量输出</strong>（一次跑 5 段，比单段提交 5 次快 5 倍）</li>
        <li>有<strong>钩子-演示-CTA</strong>这种结构化广告需求</li>
        <li>需要<strong>段间一致性</strong>（同一人 / 同一产品 / 同一光线跨段不漂移）</li>
      </ul>

      <H3 id="ugc-frameworks">三种 Hook Framework</H3>
      <p>
        UGCFrameworkPicker 提供 3 个开箱即用的广告骨架，根据你产品的特性选：
      </p>
      <SpecTable
        headers={["框架", "段结构", "适合场景"]}
        rows={[
          ["中段-冲击型", "1.钩子(2s) → 2.问题(4s) → 3.冲击演示(6s) → 4.效果(6s) → 5.CTA(2s)",
           "新奇产品 / 效果可视化强（清洁剂 / 工具）"],
          ["完整教育型", "1.问题(4s) → 2.原理(6s) → 3.演示(6s) → 4.效果对比(6s) → 5.购买理由(4s) → 6.CTA(2s)",
           "需要解释原理（保健品 / 美妆 / 数码）"],
          ["口碑型", "1.开场自介(4s) → 2.使用前(4s) → 3.使用中(6s) → 4.使用后(6s) → 5.推荐(4s)",
           "真人测评 / 口红 / 服装"],
        ]}
      />

      <H3 id="ugc-universal">Universal Blocks · 跨段一致性</H3>
      <p>
        批量短片独有的 4 个&quot;通用锚点&quot;字段，约束所有 chunk 共享同一视觉规范。
        UniversalBlocksEditor 默认折叠，智能预填（Card 1 已有信息自动填进去）：
      </p>
      <SpecTable
        headers={["字段", "用途", "示例"]}
        rows={[
          ["characterLock", "锁定主角形象", "亚洲女性，黑色长发，黑色 T 恤，无妆"],
          ["actionDirection", "动作的统一方向 / 视线", "镜头始终保持在主角右侧 45°，主角面对镜头说话"],
          ["realismBlock", "真实感约束", "不要 CGI 塑料感，不要过曝高光，保留真实毛孔与肤色"],
          ["excludeBlock", "全局排除项", "禁止：模糊脸、多手、品牌 logo、字幕水印"],
        ]}
      />

      <H3 id="ugc-chunks">ChunksTimeline · 段编辑</H3>
      <p>
        Step 2 一键生成 N 段 hero 后，每段进入 ChunksTimeline —— 横向时间轴，
        可拖拽编辑每段的 voiceover / framing / hookType / duration：
      </p>
      <CodeBlock title="ChunksTimeline 字段">
{`Chunk #1 [钩子]
  duration:   2.0s
  hookType:   shock         ← 10 类钩子框架之一
  framing:    女主突然转头看向镜头，眼神惊讶
  voiceover:  "你绝对没见过这个！"  ← 烧字幕用
  modelHint:  happyhorse-1.0-i2v

Chunk #2 [问题]
  duration:   4.0s
  hookType:   problem-aware
  ...`}
      </CodeBlock>

      <H3 id="ugc-hooks">10 类 Hook 框架</H3>
      <SpecTable
        headers={["hookType", "中文", "典型开场"]}
        rows={[
          [<code key="1">problem-aware</code>, "问题觉知", "&quot;你的 XX 总是 YY 吗？&quot;"],
          [<code key="2">shock</code>, "震惊式", "&quot;我不敢相信居然...&quot;"],
          [<code key="3">question</code>, "提问式", "&quot;猜猜这是什么？&quot;"],
          [<code key="4">comparison</code>, "对比式", "&quot;XX vs YY，结果惊人&quot;"],
          [<code key="5">demonstration</code>, "演示式", "直接展示效果，不说话"],
          [<code key="6">testimonial</code>, "证言式", "&quot;用了 30 天后...&quot;"],
          [<code key="7">curiosity</code>, "好奇心", "&quot;原来是这样工作的...&quot;"],
          [<code key="8">authority</code>, "权威背书", "&quot;XX 医生告诉我...&quot;"],
          [<code key="9">urgency</code>, "紧迫感", "&quot;只剩 24 小时...&quot;"],
          [<code key="10">storytelling</code>, "故事化", "&quot;那天我正在...&quot;"],
        ]}
      />

      <H3 id="ugc-batch">Card 3 · 批量并行提交</H3>
      <p>
        UGCBatchSubmit 把 N 段拆成 N 个独立 task，<code>Promise.all</code> 并行调用，每段带独立状态徽章：
      </p>
      <CodeBlock>
{`pending → submitting → running → saving → done
                                      ↓
                                   error (单段重试)`}
      </CodeBlock>
      <p>5 段同时跑，总时长 ≈ 单段时长（80–120s），比串行快 5 倍。</p>

      <H3 id="ugc-postprocess">PostProcessTools · 浏览器内后期</H3>
      <p>
        所有段跑完后，PostProcessTools 调用 <strong>FFmpeg.wasm</strong> 在浏览器内完成后期流水线
        —— 不需要服务器算力、不需要下载到本地用别的软件：
      </p>
      <SpecTable
        headers={["处理", "FFmpeg filter", "参数范围"]}
        rows={[
          ["段间淡入淡出", "xfade + acrossfade", "0–2s 可调"],
          ["烧字幕", "drawtext", "黑边白字，按段时间窗显示"],
          ["调速", "setpts + atempo", "0.7–1.0x"],
          ["BGM 混音", "amix", "可选，音量独立可调"],
        ]}
      />
      <p>输出直接写到项目目录的 <code>videos/</code>。</p>

      <H3 id="ugc-flow">完整工作流（UGC）</H3>
      <CodeBlock title="跨境电商投流典型路径">
{`工坊 ─→ 开导演台 ─→ 切 📱 批量短片
   ↓
Card 1: 上传产品图 + 模特图 + 卖点 + 一句话 brief
   ↓
选 UGC 框架 (中段-冲击型 / 完整教育型 / 口碑型)
   ↓
🚀 一键生成 5 段 (generateChunksFromBrief 模板填充)
   ↓
ChunksTimeline 微调每段 voiceover / framing
   ↓
Card 3: UGCBatchSubmit 5 段并行跑 (每段独立 task，实时进度)
   ↓
PostProcessTools 一键后期: crossfade + 字幕 + 0.9× 速度 + 可选 BGM
   ↓
档案下载 → 投流`}
      </CodeBlock>

      <Callout type="warn" title="UGC 当前的已知限制">
        <p>
          1) <strong>chunks 目前并行独立生成</strong>，段间无视觉衔接保证 — 已有 crossfade 后期补救（0–2s 可调），
             但首尾帧不能精确对齐。<br />
          2) Happy Horse 不识别抽象情绪词（&quot;开心&quot;/&quot;紧张&quot;），<code>generateChunksFromBrief</code> 模板
             的 framing 字段需要写成<strong>物理动作描述</strong>（&quot;微微张嘴露齿笑&quot;）。<br />
          3) 路线图中：<strong>Storyboard 共享锚点法</strong> —— 一张 N 格 storyboard 网格图作为所有 chunks 共享 reference，
             跨段视觉一致性比 character lock 更稳。
        </p>
      </Callout>
    </HelpSection>
  );
}
