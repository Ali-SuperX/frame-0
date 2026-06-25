import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";

export function Sec02QuickStart() {
  return (
    <HelpSection id="quickstart" no="02" title="快速开始" group="入门">
      <p className="lead">
        从打开页面到看到第一条视频，通常 5 分钟。本节描述最短路径；详细模块用法见后续章节。
      </p>

      <H3 id="quickstart-prereq">前置条件</H3>
      <Callout type="warn" title="必须有百炼 API Key">
        <p>
          Frame/0 不绑定自家服务器算力，所有视频生成都通过<strong>你自己的</strong>阿里云百炼 DashScope
          账号调用。前往 <a href="https://bailian.console.aliyun.com" target="_blank" rel="noreferrer">bailian.console.aliyun.com</a>
          开通账户，拿到 sk- 开头的 API Key，并确保账户里有可用余额。
        </p>
        <p>
          每条视频成本约 ¥0.5–¥3（不同模型不同档位），建议先充值 ¥50–¥100 试水。
        </p>
      </Callout>

      <H3 id="quickstart-steps">四步上手</H3>
      <div className="help2-steps">
        <div className="help2-step">
          <span className="help2-step-num">1</span>
          <div className="help2-step-body">
            <h4>配置 API Key</h4>
            <p>
              工坊右上角看到 &quot;未配置 Key&quot; 字样，点击打开设置弹窗，粘贴 sk- 开头的字符串保存。
              Key 仅存储在你的浏览器 localStorage，不会上传任何服务器。
              切换 Cmd+/ 可一键打开 / 关闭设置。
            </p>
          </div>
        </div>
        <div className="help2-step">
          <span className="help2-step-num">2</span>
          <div className="help2-step-body">
            <h4>选模式 + 模型</h4>
            <p>
              右上角 Tab：<code>T2V</code>（文生视频）/ <code>I2V</code>（图生视频）/ <code>R2V</code>（参考图生视频）/
              <code>生图</code>。每个 Tab 下挑模型 —— 主推 <code>happyhorse-1.0</code> 系列（质量稳、成本可控）。
              如果只是想快速看效果，从 <code>T2V</code> 开始最简单。
            </p>
          </div>
        </div>
        <div className="help2-step">
          <span className="help2-step-num">3</span>
          <div className="help2-step-body">
            <h4>写 prompt → 提交</h4>
            <p>
              按<a href="#prompt-guide">提示词指南</a>的&quot;五要素&quot;框架描述：
              <em>主体 · 动作 · 场景 · 镜头 · 氛围</em>。填好后点右下角的橙色
              <strong>生成 ↑</strong> 按钮，或按 <kbd className="help2-kbd">Ctrl+Enter</kbd>。
              左侧任务列表立刻出现 RUNNING 项，进度实时更新。
            </p>
          </div>
        </div>
        <div className="help2-step">
          <span className="help2-step-num">4</span>
          <div className="help2-step-body">
            <h4>剪辑或归档</h4>
            <p>
              视频跑完自动播放预览。满意的素材点&quot;拿去剪辑&quot;送进
              <a href="#editor">剪辑模块</a>拼成片；不满意的可<strong>↻ 重试（保留参数）</strong>，
              或修改 prompt 重生。所有成果自动入<a href="#archive">档案</a>，可随时回溯参数。
            </p>
          </div>
        </div>
      </div>

      <H3 id="quickstart-tips">新手建议</H3>
      <ul>
        <li><strong>从 T2V 起步</strong>：不需要准备素材，纯文字驱动，最容易上手。</li>
        <li><strong>选 5s 时长</strong>：首次尝试用最短时长（5 秒），成本最低、迭代最快。</li>
        <li><strong>关闭水印</strong>：百炼默认输出右下角水印，参数面板里可关。</li>
        <li><strong>用 16:9 横屏</strong>：默认输出比例，PC 端观看友好。竖屏视频用 9:16，方屏 1:1。</li>
        <li><strong>看任务列表的 ETA</strong>：典型 5s 视频 ETA 60–90 秒；超过 3 分钟还在跑就有可能卡住，可单条重试。</li>
      </ul>

      <Callout type="tip" title="避免新手坑">
        <p>
          1) <strong>不要先上 R2V</strong>：R2V 多参考图最难调，先用 T2V/I2V 跑熟节奏再来。<br />
          2) <strong>不要塞太长 prompt</strong>：超过 1500 字的 prompt 模型反而会失焦，关键词重复 3 次以上效果反而下降。<br />
          3) <strong>不要传超过 20MB 的图</strong>：DashScope 硬性限制，<a href="#limits">系统限制</a>章节有完整列表。
        </p>
      </Callout>
    </HelpSection>
  );
}
