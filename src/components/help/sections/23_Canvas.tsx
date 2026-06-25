import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";
import { SpecTable } from "../ui/SpecTable";

export function Sec23Canvas() {
  return (
    <HelpSection id="canvas" no="✦" title="节点式画布 Canvas" group="画布 Canvas">
      <p className="lead">
        画布是工坊的「节点形态」—— 一张无限画布，每个<strong>节点 = 一次生成</strong>。
        从成片分支出延续 / 参考 / 变体，把灵感长成一棵可追溯的创作树。
        画布与工坊共享同一份 jobs，互通无缝。
      </p>

      <H3 id="canvas-node">节点：写、生、分支</H3>
      <p>每个节点经历两态：</p>
      <ul>
        <li><strong>compose 态</strong> —— 选模型、写 prompt、调参数、传媒体（与工坊同一套动态参数系统）。</li>
        <li><strong>成片态</strong> —— 生成完成后展示结果（图 / 视频），可直接分支。</li>
      </ul>

      <H3 id="canvas-generate">生成 = 派生结果子节点</H3>
      <p>
        点「生成」<strong>不会折叠当前节点</strong>，而是派生一个<strong>结果子节点</strong>承载这次产出（连线过去）。
        源 compose 节点保留 —— 同一个 prompt 可以反复生成多个变体子节点，非破坏式地横向探索。
      </p>

      <H3 id="canvas-inherit">节点继承「＋」：延续 / 参考 / 延伸</H3>
      <p>每个节点右缘有一个金色「＋」，按节点状态给继承选项：</p>
      <SpecTable
        headers={["继承方式", "做什么", "落地"]}
        rows={[
          ["延续 Continue", "接下一镜，讲连续故事", "图成片→i2v（首帧）/ 视频成片→ve（续写）"],
          ["参考 Reference", "成片当参考图喂新生成，换场景保主体", "→ r2v（reference_urls）"],
          ["延伸 Extend", "复制本节点配方开同源兄弟，微调变体", "克隆 draft，任意节点皆可"],
        ]}
      />
      <p>
        延续 / 参考需要先有成片；延伸任意节点都行（含还没生成的 compose）。
        成片节点也保留了内联快捷「🎞 动画 / ✂ 编辑 / ⟳ 变体」，与「＋」并存。
      </p>

      <H3 id="canvas-assist">节点内：提示库 + 导演套路</H3>
      <p>节点的 prompt 框下有两个就地助手，不用跳转：</p>
      <ul>
        <li>
          <strong>✨ 提示库</strong> —— 复用工坊的 STARTERS / 收藏，弹层就地选，三种范围
          （只要 prompt / 只换参数 / 全套）直接套到本节点。
        </li>
        <li>
          <strong>🎬 导演</strong> —— 弹出导演台的 34 个场景套路预设（电商爆款 / 电影质感 /
          美妆 / UGC…），选一个套路后 AI 按它把你的想法流式扩写成专业 prompt，
          预览对比原文，满意再采用。另有「自由发挥」= 不套套路。
        </li>
      </ul>

      <H3 id="canvas-projects">多画布项目</H3>
      <p>
        顶部品牌旁的「● 项目名 ▾」是画布项目切换器：新建 / 切换 / 重命名 / 两步删除，
        每个项目是一张独立的图（节点 + 连线），各自<strong>自动保存</strong>。
        老的单一画布会无损迁移成「默认画布」。
      </p>

      <H3 id="canvas-links">四面联动</H3>
      <p>画布不是孤岛，和工坊 / 资产库 / 导演台闭环互通：</p>
      <ul>
        <li>资产库卡片「⊞ 画布」—— 成片一键落为画布节点（作分支起点）。</li>
        <li>画布成片节点「⤢ 工坊」—— 送回线性工坊精修；「🎭 导演台」—— 作角色参考多镜创作。</li>
        <li>画布与工坊共享同一 jobs 池，画布生成的成片也会出现在工坊任务栏 / 资产库。</li>
      </ul>

      <Callout type="info" title="画布 vs 工坊，怎么选">
        <p>
          要<strong>线性、专注单条</strong>精修 → 工坊底部对话框；
          要<strong>发散、对比多个变体、讲分镜故事</strong> → 画布。
          两者随时互送（⤢ / ⊞），不丢工程。
        </p>
      </Callout>
    </HelpSection>
  );
}
