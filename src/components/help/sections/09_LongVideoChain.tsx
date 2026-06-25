import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";
import { SpecTable } from "../ui/SpecTable";
import { CodeBlock } from "../ui/CodeBlock";

export function Sec09LongVideoChain() {
  return (
    <HelpSection id="long-video-chain" no="09" title="长视频链式生成" group="导演台 R2V">
      <p className="lead">
        单段视频上限 15s，但通过 ContinuationPanel / ContinuationChainPanel 的<strong>三种锚点策略</strong>
        可以串成几十秒甚至几分钟的连续叙事。核心思想：上一段的尾帧 + 锚点（角色/场景）作为下一段的参考。
      </p>

      <H3 id="chain-3strategies">三种锚点策略</H3>
      <SpecTable
        headers={["策略 AnchorStrategy", "段 1", "段 2+", "一致性", "成本"]}
        rows={[
          [<code key="r">r2v-chain</code>, "R2V (起点)",
           "R2V (共享角色锚点 + 上段尾帧作为参考图)", "★★★ 最高", "高 (每段都 R2V)"],
          [<code key="i">i2v-bridge</code>, "R2V (起点)",
           "I2V (上段尾帧作为首帧)", "★★ 中", "中 (后续段便宜)"],
          [<code key="h">hybrid</code>, "R2V",
           "关键转场 R2V，平滑过渡段 I2V", "★★★ 平衡", "中"],
        ]}
      />

      <H3 id="chain-pick">怎么选策略</H3>
      <ul>
        <li>
          <strong>r2v-chain</strong> — 复杂剧情，每段都需要新的场景/动作，角色必须严格保持。
          适合短剧 / 多场景故事。<strong>代价</strong>：每段 60–180s 推理时间，5 段就是 5–15 分钟。
        </li>
        <li>
          <strong>i2v-bridge</strong> — 主要是&quot;延续&quot;场景（同一动作的不同瞬间），
          段间过渡只需视觉平滑。<strong>优势</strong>：后续段 I2V 更快更便宜。
          <strong>代价</strong>：复杂动作切换可能丢失锚点。
        </li>
        <li>
          <strong>hybrid</strong> — 默认推荐。在视觉变化大的&quot;关键转场&quot;用 R2V，
          视觉相近的&quot;平滑段&quot;用 I2V。需要你手动标记哪些段是&quot;关键&quot;。
        </li>
      </ul>

      <H3 id="chain-tailframe">自动抽帧</H3>
      <p>
        每段视频生成完成后，<code>videoUtils.ts</code> 会自动抽取 first / mid / last 三个 keyFrame
        作为下一段的参考素材。无需手动操作。
      </p>
      <CodeBlock title="抽帧流程">
{`段 1 视频 (5s) → 自动抽帧
  ├── first keyFrame  (t=0.0s)
  ├── mid keyFrame    (t=2.5s)  ← 通常给 r2v-chain 用做主参考
  └── last keyFrame   (t=4.95s) ← 通常给 i2v-bridge 用做首帧

段 2 提交时:
  - i2v-bridge:  自动把 last keyFrame 填到首帧槽
  - r2v-chain:   自动把 mid keyFrame 加入 references[]，
                 同时保留段 1 用过的 character/product references`}
      </CodeBlock>

      <H3 id="chain-scheduler">串行调度</H3>
      <p>
        长视频链式是<strong>严格串行</strong>的（与 UGC 多段<em>并行</em>不同），
        因为段 N+1 必须等段 N 完成才能拿到尾帧。每段独立轮询，失败可单段重试不影响其他段。
      </p>
      <CodeBlock>
{`段 1 提交 → 等完成 (60-180s) → 抽尾帧
   ↓
段 2 提交 (用段 1 尾帧) → 等完成 → 抽尾帧
   ↓
段 3 提交 (用段 2 尾帧) → 等完成 → 抽尾帧
   ↓
... 最多支持 10 段连续`}
      </CodeBlock>

      <H3 id="chain-happyhorse-quirk">HappyHorse 的特殊处理</H3>
      <Callout type="warn" title="happyhorse-1.0 不支持 last_frame 字段">
        <p>
          HappyHorse 模型本身没有 <code>last_frame</code> 入参（不像 Wan 那样支持&quot;指定首尾帧&quot;）。
          ContinuationPanel 对 r2v-chain 的处理方式：
          <strong>通过 i2v 变体 + 抽帧作为参考图绕开</strong>。
          也就是说，链式段 2+ 实际跑的是 <code>happyhorse-1.0-i2v</code>，把上段尾帧填到首帧槽。
          这是模型限制，不是 Frame/0 的问题。
        </p>
      </Callout>

      <H3 id="chain-config">LongVideoConfig 字段</H3>
      <SpecTable
        headers={["字段", "类型", "默认", "说明"]}
        rows={[
          ["chainCount", "int (2–10)", "3", "总共生成几段"],
          ["anchorStrategy", "enum", "hybrid", "r2v-chain / i2v-bridge / hybrid"],
          ["sharedCharacters", "boolean", "true", "所有段共享 character references"],
          ["sharedScene", "boolean", "false", "所有段共享 scene reference (锁场景)"],
          ["keyFrameOffsetRatio", "float (0-1)", "0.5", "抽 mid 帧的时间比例 (0.5 = 中点)"],
          ["retryFailedSegment", "boolean", "true", "段失败时不阻塞，可后续单独重试"],
        ]}
      />

      <H3 id="chain-postprocess">链式生成的后期</H3>
      <p>
        链式生成的多个段默认<strong>已经基于尾帧延续</strong>，视觉过渡自然。
        但为消除细微跳动，建议过一遍 PostProcessTools 加 0.3–0.5s 的 crossfade：
      </p>
      <CodeBlock title="推荐的链式后期参数">
{`crossfade duration:     0.3s    (微过渡，几乎察觉不到，但消除帧跳)
crossfade transition:   fade    (避免 wipe / slide，会破坏连续性)
speed:                  1.0x    (保持原速)
subtitles:              off     (链式通常不需要字幕)
bgm:                    可选    (统一音轨增强整体感)`}
      </CodeBlock>

      <Callout type="tip" title="链式 vs UGC 多段">
        <p>
          一句话区分：<strong>链式 = 一个故事跨多段连续</strong>；
          <strong>UGC 多段 = 一个广告由多个独立 shot 组成</strong>。
          故事性强用链式（叙事 / 短剧），结构化营销用 UGC（钩子-演示-CTA）。
        </p>
      </Callout>
    </HelpSection>
  );
}
