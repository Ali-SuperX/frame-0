import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";

export function Sec11Compare() {
  return (
    <HelpSection id="compare" no="11" title="对比台 Compare" group="后期与归档">
      <p className="lead">
        同 prompt 横跨多家模型并排出片。让你<strong>客观判断</strong>哪家模型最适合你的场景、
        哪组参数效果最好。是 Frame/0 三大支柱之一 (<strong>Compare</strong>)。
      </p>

      <H3 id="compare-when">什么时候用</H3>
      <ul>
        <li><strong>新项目起步</strong> — 不知道选 HappyHorse / Wan / PixVerse / Kling，让它们对同一 prompt 出片对比</li>
        <li><strong>参数调优</strong> — 同模型不同 seed / 不同分辨率，A/B 看差异</li>
        <li><strong>Prompt 实验</strong> — 同模型不同 prompt 变体，看哪种描述风格效果最稳</li>
        <li><strong>客户提案</strong> — 给甲方看 3 个版本，让甲方选</li>
      </ul>

      <H3 id="compare-howto">使用步骤</H3>
      <ol>
        <li><strong>在档案勾选</strong>需要对比的视频（2–6 个，超过 6 个网格会过密）</li>
        <li>顶栏点 <strong>对比</strong> 链接，进入 Compare 视图</li>
        <li>选择视图模式：<strong>Before/After 滑动</strong> 或 <strong>多卡片网格</strong></li>
      </ol>

      <H3 id="compare-modes">两种视图模式</H3>
      <p>
        <strong>Before/After 滑动对比</strong> —— 只选 2 个视频时可用。
        中间一条可拖拽的分割线，左右两个视频同步播放，拖动中线在两个画面间切换。
        适合精确比较同一场景在不同提示词或参数下的细微差别。最适合 A/B 测试。
      </p>
      <p>
        <strong>多卡片网格</strong> —— 选 3+ 视频时自动启用。
        网格卡片形式并排呈现，所有视频同步播放，便于全局视角下快速筛选最优结果。
      </p>

      <H3 id="compare-sync">同步播放控制</H3>
      <p>
        无论哪种视图，播放控制都是同步的：
      </p>
      <ul>
        <li>点任一视频上的 <strong>播放/暂停</strong>，所有视频同时响应</li>
        <li>拖动任一进度条，所有视频跳到对应时间</li>
        <li>音频默认全部静音（避免混音噪音），可单独开任一视频的音轨</li>
      </ul>

      <Callout type="tip" title="对比的真正价值">
        <p>
          AI 视频模型经常&quot;偶尔翻车&quot;。同一 prompt 跑 3 个种子，可能 1 个完美 2 个糟糕。
          对比台能让你<strong>3 分钟内淘汰 80% 的不满意版本</strong>，比单条审视高效得多。
          建议工作流：<strong>每次提交跑 3 个 seed → 全勾选 → 对比 → 留最好的</strong>。
        </p>
      </Callout>
    </HelpSection>
  );
}
