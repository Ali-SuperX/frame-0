import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";

export function Sec21Roadmap() {
  return (
    <HelpSection id="roadmap" no="21" title="路线图与边界" group="关于">
      <p className="lead">
        Frame/0 是持续迭代的产品。本节列出已知边界（短期不会改）和路线图（已规划方向）。
        想要的功能不在路线里？欢迎反馈 — 见 <a href="#about">22 关于</a> 章节。
      </p>

      <H3 id="roadmap-confirmed-limits">已确认的边界</H3>
      <ul>
        <li>
          <strong>happyhorse-1.0 不支持 <code>last_frame</code> 字段</strong>。
          ContinuationPanel 对 r2v-chain 的处理是通过 i2v 变体 + 抽帧作为参考图绕开。
          这是模型限制，等 HappyHorse 2.0 才能改。
        </li>
        <li>
          <strong>UGC chunks 目前并行独立生成</strong>，段间无视觉衔接保证。
          已有 crossfade 后期补救（0–2s 可调），但首尾帧不能精确对齐。
        </li>
        <li>
          <strong>Card 2 的 34 个 preset 是 &quot;AI 生成配置捆绑包&quot;</strong>，
          不是现成 prompt 文本模板。选了之后还是要走 streamChat 流式生成。
        </li>
        <li>
          <strong>localStorage 容量上限</strong>：用户上传图片不当持久化在 zustand persist 里
          会触发 <code>QuotaExceededError</code>。已用 <code>stripForStorage()</code> +
          <code>quotaSafeStorage()</code> Proxy + jobs MAX_PERSISTED 控制，但极端场景仍可能撞墙。
        </li>
        <li>
          <strong>Safari 不支持 File System Access API</strong>。导演台项目保存到磁盘 + 文件桥功能
          在 Safari 不可用。其他功能正常。
        </li>
        <li>
          <strong>FFmpeg.wasm 不支持 4K 渲染</strong>。浏览器内存约束。1080P 已能覆盖 99% 投流需求。
        </li>
      </ul>

      <H3 id="roadmap-coming">已在路上的方向</H3>
      <ul>
        <li>
          <strong>Storyboard 共享锚点法</strong>（来自社区观察）：
          一张 N 格 storyboard 网格图作为所有 chunks 共享 reference，
          跨段视觉一致性比 character lock 更稳。已有 POC，预计 Q3 上线。
        </li>
        <li>
          <strong>&quot;现成 prompt 文本骨架&quot;一键填入模板</strong>，
          跟现有 34 个 AI 配置 preset 互补。给不愿等 AI 流式扩写的用户一条快路径。
        </li>
        <li>
          <strong><code>buildChunkPrompt()</code> 重构成 6 块官方格式</strong>
          (subject / action / environment / style / camera / audio)。
          配合 HappyHorse 官方 prompt guide 的最新规范。
        </li>
        <li>
          <strong>情绪词 → 物理动作翻译</strong>（<code>generateChunksFromBrief</code> 模板的 framing 字段）。
          HappyHorse 不识别抽象情绪词（&quot;开心&quot;/&quot;紧张&quot;），需要翻译成
          具体物理动作（&quot;嘴角上扬 5°&quot;/&quot;肩膀微微抖动&quot;）。
        </li>
      </ul>

      <H3 id="roadmap-discover">讨论中（未确定）</H3>
      <ul>
        <li>
          <strong>多用户协作</strong> —— 同一项目多人编辑，需要后端 sync 服务，
          架构改动较大。目前只在私有部署场景实现。
        </li>
        <li>
          <strong>移动端原生 App</strong> —— Web 版已经 PWA 可用，原生 App 优先级较低。
        </li>
        <li>
          <strong>集成 Sora / Veo 等海外模型</strong> —— 待 API 开放且能走代理。
        </li>
        <li>
          <strong>语音克隆 / 配音 TTS</strong> —— 当前 UGC voiceover 是占位文本，
          需要接入 TTS 服务。
        </li>
      </ul>

      <Callout type="info" title="路线图不是承诺">
        <p>
          所有路线图项的优先级会根据用户反馈调整。
          &quot;路上的方向&quot;不等于&quot;X 月一定发布&quot; — 视实际开发进度可能延期或撤回。
          想优先获得某个功能？在反馈渠道投票 / Issue +1，权重确实有效。
        </p>
      </Callout>
    </HelpSection>
  );
}
