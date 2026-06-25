import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";
import { SpecTable } from "../ui/SpecTable";

export function Sec01Overview() {
  return (
    <HelpSection id="overview" no="01" title="产品概览" group="入门">
      <p className="lead">
        <strong>Frame/0</strong> 是一台与机器共同导演的 AI 影像生产仪器 —— 把
        &quot;写 prompt → 调参 → 提交 → 等结果 → 拼接 → 投流&quot; 整条链路收进一个产品。
        它基于阿里云百炼 DashScope 与多家视频模型，覆盖从灵感、文案、出片、剪辑到归档
        全流程的视觉创作工作台。
      </p>

      <H3 id="overview-pillars">三大支柱</H3>
      <p>
        Frame/0 的设计哲学围绕三个核心命题展开，它们也是判断一个 AI 视频工具是否
        &quot;能用&quot;的关键标准：
      </p>
      <div className="help2-pillars">
        <div className="help2-pillar">
          <p className="help2-pillar-sub">Direction</p>
          <p className="help2-pillar-title">导演</p>
          <p>你给意图、节奏、情绪；机器给像素、镜头、连续性。提示词是临时脚手架，不是语言。</p>
        </div>
        <div className="help2-pillar">
          <p className="help2-pillar-sub">Continuity</p>
          <p className="help2-pillar-title">连续性</p>
          <p>人物、光线、时间在镜头之间保持一致。记忆不是彩蛋，是前提。</p>
        </div>
        <div className="help2-pillar">
          <p className="help2-pillar-sub">Compare</p>
          <p className="help2-pillar-title">对比</p>
          <p>同一 prompt 横跨多家模型并排出片，让你知道选哪家、改哪个参数。</p>
        </div>
      </div>

      <H3 id="overview-users">目标用户</H3>
      <SpecTable
        headers={["角色", "典型诉求", "推荐入口"]}
        colWidths={["20%", "55%", "25%"]}
        rows={[
          ["跨境 / 国内电商投流团队", "量产 UGC 真人测评、产品广告，要求时效与一致性", "导演台 → 批量短片"],
          ["品牌 / 4A 团队", "高端 Cinematic 片，单条精品 hero", "导演台 → 单镜大片"],
          ["短视频创作者", "长片连续叙事、连载短剧", "工坊 → 长视频链式生成"],
          ["AI 视频研究者", "多模型横评，prompt 工程实验", "对比台 + 工坊"],
        ]}
      />

      <H3 id="overview-modules">核心模块一览</H3>
      <p>顶部导航的 8 个一级页面，按使用阶段分组：</p>
      <SpecTable
        headers={["模块", "用途", "本文档章节"]}
        rows={[
          [<code key="1">工坊 Studio</code>, "默认主页，单任务模型调用工作台", "10 / 13"],
          [<code key="2">导演台 R2V</code>, "项目化多卡片工作流，分 Cinematic / UGC 两种", "06–09"],
          [<code key="3">对比台 Compare</code>, "同 prompt 横跨多模型并排出片", "11"],
          [<code key="4">档案 Archive</code>, "全生产成果归档，可一键喂剪辑", "12"],
          [<code key="5">短漫剧 Comic</code>, "项目目录浏览器（File System Access）", "16"],
          [<code key="6">剪辑 Editor</code>, "浏览器内多轨非线性编辑", "10"],
          [<code key="7">灵感 Discover</code>, "聚合 Civitai / Reddit 外部素材", "14"],
          [<code key="8">指南 Guide</code>, "Happy Horse Prompt Guide V3 完整静态版", "13"],
        ]}
      />

      <Callout type="tip" title="一句话理解 Frame/0">
        <p>
          它不是又一个生成式 AI 工具，而是为<strong>专业内容生产</strong>而生的 &quot;摄影棚操作系统&quot;
          —— 大多数功能都围绕<strong>一致性</strong>（同人物 / 同光线 / 同质感跨镜头不漂移）
          和<strong>批量化</strong>（一次输入产出多版本可对比、可批跑）展开。
        </p>
      </Callout>
    </HelpSection>
  );
}
