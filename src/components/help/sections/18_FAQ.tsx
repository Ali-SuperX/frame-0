import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";

function FAQ({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="help2-details">
      <summary>{q}</summary>
      <div className="help2-details-body">{children}</div>
    </details>
  );
}

export function Sec18FAQ() {
  return (
    <HelpSection id="faq" no="18" title="FAQ / 故障排查" group="运维参考">
      <p className="lead">
        遇到问题先看本节。所有问题按场景分组，从最常见的&quot;账号 / 上传&quot;到&quot;生成失败 / 数据丢失&quot;。
      </p>

      <div className="help2-faq-group">
        <H3 id="faq-account">账号与配置</H3>
        <FAQ q="API Key 在哪申请？要付费吗？">
          <p>
            前往阿里云百炼控制台 <a href="https://bailian.console.aliyun.com" target="_blank" rel="noreferrer">bailian.console.aliyun.com</a>
            注册账户，在 &quot;API-KEY 管理&quot; 创建 sk- 开头的 Key。
            必须先在控制台<strong>开通你要用的模型服务</strong>（如 HappyHorse、Wan 等）才能调用。
          </p>
          <p>付费按调用次数 / 分辨率 / 时长计算。典型 5s 720P 视频 ¥0.5–¥1.5，建议先充值 ¥50 试水。</p>
        </FAQ>
        <FAQ q="我的 API Key 会被泄露吗？">
          <p>
            不会。API Key 仅保存在你浏览器的 localStorage，前端代码全部开源，
            服务端只在你发起请求时短暂使用 Key 转发到百炼，不留存任何日志。
            如果担心，可以在百炼控制台为这个 Key 设置 IP 白名单或调用次数上限。
          </p>
        </FAQ>
        <FAQ q="可以多人用同一个 Key 吗？">
          <p>
            技术上可以，但<strong>不建议</strong>。共享 Key 会让百炼侧的费用追溯混乱，
            且单个 Key 的 QPS 限流会被多人撞到。建议每人单独申请 Key，或公司账户开子账号。
          </p>
        </FAQ>
      </div>

      <div className="help2-faq-group">
        <H3 id="faq-upload">上传问题</H3>
        <FAQ q="为什么上传图片提示 &quot;大小超过 20 MB&quot;？">
          <p>
            DashScope 硬性限制图片 ≤ 20 MB。Frame/0 在客户端就拦截，不会上传超限图。
            解决：用图片压缩工具（如 ImageOptim、squoosh.app）压到 20 MB 以下。
            PNG 噪点图最容易超限，转 JPG 通常能压到原大小的 10–20%。
          </p>
          <p>完整图片约束见 <a href="#limits">17 系统限制</a>。</p>
        </FAQ>
        <FAQ q="为什么提示 &quot;分辨率 200×200 太小&quot;？">
          <p>
            DashScope 要求最小 300×300 px。Frame/0 客户端校验。
            解决：用图片放大工具（如 Real-ESRGAN、Topaz Gigapixel）放到 300+ 后再传。
            或者重新出图时直接选 ≥ 512×512 分辨率。
          </p>
        </FAQ>
        <FAQ q="为什么提示 &quot;H/W 超出 0.40–2.50&quot;？">
          <p>
            DashScope 限制图片宽高比在 1:2.5 到 2.5:1 之间。太宽或太长的全景图都会被拒。
            解决：用图片编辑工具上下/左右补白边 padding 到合规比例。
            Frame/0 内部 Python 脚本就这么处理三宫格图（3768×1308 → 3768×1582）。
          </p>
        </FAQ>
        <FAQ q="拖拽上传不响应？">
          <p>
            常见原因：(1) 文件不是图片格式 (检查后缀)；
            (2) 浏览器拦截了 drag-drop（隐身模式有时会）；
            (3) chrome-devtools 自动化操作 Chrome 时，drag-drop 事件可能被拦截，用 file input click 替代。
          </p>
        </FAQ>
      </div>

      <div className="help2-faq-group">
        <H3 id="faq-generation">生成失败</H3>
        <FAQ q="任务一直 RUNNING 不结束？">
          <p>
            正常 5s 视频应该 60–120s 完成。如果超过 5 分钟：
          </p>
          <ol>
            <li>点该任务的 <strong>↻ 重试（保留参数）</strong> —— 大多数情况是百炼侧偶发问题</li>
            <li>查百炼控制台 → 任务列表 → 该任务的状态（可能后端已失败但前端轮询超时）</li>
            <li>检查百炼账户余额，余额不足任务会卡在 PENDING</li>
          </ol>
        </FAQ>
        <FAQ q="任务 FAILED，错误信息看不懂？">
          <p>
            点失败任务卡片，下方会展示完整错误。常见类型：
          </p>
          <ul>
            <li><code>InvalidParameter</code> — 参数不合法（如分辨率不支持），改参数重试</li>
            <li><code>InsufficientBalance</code> — 余额不足，去百炼充值</li>
            <li><code>RateLimitExceeded</code> — QPS 超限，等 30 秒重试</li>
            <li><code>OSS Resource ... not exist</code> — 参考图 URL 过期，<a href="#persistence">见 15</a> 自动 refresh 章节</li>
            <li><code>image resolution / ratio / size</code> — 见上面&quot;上传问题&quot;</li>
          </ul>
        </FAQ>
        <FAQ q="生成的视频质量不稳定，时好时坏？">
          <p>
            AI 视频模型的固有特性，即使同 prompt 同 seed 也会有质量波动。
            最佳实践：<strong>每次提交跑 3 个不同 seed</strong>（在档案勾选 → 对比台挑最好的）。
            或者尝试 <code>seed=0</code> 随机抽签，连跑 5 次取最满意的。
          </p>
        </FAQ>
        <FAQ q="人物 / 产品的外观一直变形怎么办？">
          <p>
            (1) 把单图换成 R2V 多参考图，明确锁定 character / product；
            (2) Prompt 加&quot;严格保留参考图外观&quot;之类约束；
            (3) Negative prompt 加 <code>warped, distorted, regenerated wrong shape</code>；
            (4) 实在不行换模型 —— 不同模型对锁定的能力差异很大。
            详见 <a href="#prompt-guide">13 提示词指南 → 常见失败模式</a>。
          </p>
        </FAQ>
        <FAQ q="R2V 一直没按宫格图演绎，只是把宫格当画面播？">
          <p>
            I2V/R2V 模型的天性是&quot;让首帧动起来&quot;。给它宫格图，它就只让宫格动。
            想要它&quot;脱离宫格、按格内容演绎&quot;非常困难。
            <strong>推荐方案</strong>：把每个格子拆成<strong>独立 I2V 任务</strong>，
            每段用对应那张原图作首帧，每段 prompt 极简（只描述一个镜头动作），
            最后用剪辑模块拼接。
          </p>
        </FAQ>
      </div>

      <div className="help2-faq-group">
        <H3 id="faq-editor">剪辑器</H3>
        <FAQ q="导出视频时浏览器卡死 / 崩溃？">
          <p>
            (1) 关闭其他重型 Tab（FFmpeg.wasm 吃内存）；
            (2) 项目超过 3 分钟时分段导出后再拼；
            (3) 降低输出分辨率从 1080P 到 720P；
            (4) 长项目优先用 Chrome（V8 内存调度优于 Safari）。
          </p>
        </FAQ>
        <FAQ q="音频对不上口型 / 节奏？">
          <p>
            (1) 单独的音频 clip 拖拽对齐 ms 级精度；
            (2) 用速度曲线（Slow→Fast / Fast→Slow）微调视频长度匹配音频；
            (3) 极端情况下导出后用桌面端 FFmpeg 重新 mux。
          </p>
        </FAQ>
        <FAQ q="转场 ⟿ 看起来生硬？">
          <p>
            默认 0.5s 对很多场景太短。视频感强的场景试 0.8–1.2s；
            UGC 快节奏场景试 0.2–0.3s。
            如果只是想消除帧跳，用 0.3s Fade 转场就够。
          </p>
        </FAQ>
      </div>

      <div className="help2-faq-group">
        <H3 id="faq-data">数据丢失</H3>
        <FAQ q="刷新页面后任务列表清空了？">
          <p>
            正常情况不会发生，Frame/0 用 IndexedDB 持久化所有任务。
            如果清空了，可能是：(1) 你用了隐身模式；(2) 浏览器自动清理过 IDB；
            (3) localStorage 撑爆触发 <code>QuotaExceededError</code>。
            可以试着从 <code>data/app-state.json</code> 服务器备份恢复（启动时 Frame/0 会自动读取）。
          </p>
        </FAQ>
        <FAQ q="缩略图都裂成 OSS 占位符了？">
          <p>
            阿里云 DashScope-instant bucket 的 OSS URL 跨天会失效。
            Frame/0 内置 <code>refreshStaleMedia()</code> 会在提交前自动重新上传。
            如果失效太久没访问过，自动恢复也失败，会显示&quot;点击重传&quot;占位符 — 手动重新上传图片即可。
            详见 <a href="#persistence">15 数据持久化</a>。
          </p>
        </FAQ>
        <FAQ q="导演台项目保存到磁盘后找不到了？">
          <p>
            浏览器的 File System Access API 不会主动提示&quot;项目存到哪了&quot;，全靠你记的目录路径。
            Frame/0 在项目列表会显示路径前缀，但不持久化完整路径（隐私考虑）。
            建议：每次保存时手动记一下目录路径，或固定保存到约定的 <code>~/Documents/frame-0-projects/</code>。
          </p>
        </FAQ>
      </div>

      <Callout type="info" title="本节没解决你的问题？">
        <p>
          1) 看 <a href="#glossary">19 术语表</a> 确认你描述的概念在 Frame/0 里叫什么。<br />
          2) 看 <a href="#limits">17 系统限制</a> 是否你撞了某个硬约束。<br />
          3) 项目 GitHub Issues / 微信群反馈 —— 详见 <a href="#about">22 关于</a> 章节。
        </p>
      </Callout>
    </HelpSection>
  );
}
