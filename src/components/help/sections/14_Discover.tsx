import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";
import { SpecTable } from "../ui/SpecTable";

export function Sec14Discover() {
  return (
    <HelpSection id="discover" no="14" title="灵感发现 Discover" group="创作辅助">
      <p className="lead">
        聚合外部 AI 创作素材，帮你突破创意瓶颈。数据持久化缓存（IndexedDB），已浏览内容不会因刷新丢失。
        点任一作品可一键引用其 prompt 到工坊。
      </p>

      <H3 id="discover-sources">数据来源</H3>
      <SpecTable
        headers={["来源", "内容类型", "刷新频率"]}
        rows={[
          ["Civitai", "全球最大 AI 创作社区，海量 SD / FLUX 作品 + prompt + LoRA", "每小时"],
          ["Reddit r/StableDiffusion", "Reddit AI 视频/图像分享社区热门", "每小时"],
          ["Reddit r/aivideo", "AI 视频专门社区", "每小时"],
          ["Curated（精选）", "Frame/0 团队人工筛选的高质量样本", "周更"],
        ]}
      />

      <H3 id="discover-no-vpn">无需翻墙 / 注册</H3>
      <p>
        所有外部源经 Frame/0 服务器代理抓取，国内直接访问。不需要注册 Civitai / Reddit 账号，
        也不需要 VPN。但要注意一些 NSFW 内容标签（社区原生标记），可在过滤器里隐藏。
      </p>

      <H3 id="discover-reuse">一键引用为 prompt</H3>
      <p>
        看到心仪的作品 → 点 <strong>用这段 Prompt</strong> 按钮：
      </p>
      <ol>
        <li>自动跳到工坊（根据原作品的 mode 选 T2V/I2V/T2I）</li>
        <li>原 prompt 自动填入提示词框</li>
        <li>如果是 I2V/R2V 类作品 + 原图可访问 → 自动尝试下载参考图</li>
        <li>你只需选模型 + 调整少量参数即可提交</li>
      </ol>

      <H3 id="discover-cache">智能缓存机制</H3>
      <p>
        所有抓取到的灵感数据本地持久化（IndexedDB），TTL <strong>1 小时</strong>。即使：
      </p>
      <ul>
        <li>网络临时断开 — 已缓存的内容依然可浏览和引用</li>
        <li>切换 Tab 后回来 — 不会重复请求，瞬间渲染</li>
        <li>刷新页面 — 1 小时内的浏览历史完整保留</li>
      </ul>

      <Callout type="tip" title="灵感的正确用法">
        <p>
          不要简单照搬别人的 prompt，那只能复刻别人的画面。<strong>把它当 5 要素填空</strong>：
          只借用别人的&quot;氛围&quot;和&quot;镜头&quot;描述，把&quot;主体&quot;和&quot;场景&quot;换成你自己的。
          这样既能学到提示词技巧，又能保留你项目的独特性。
        </p>
      </Callout>

      <H3 id="discover-roadmap">路线图</H3>
      <ul>
        <li>📦 接入 <strong>Reddit r/midjourney</strong>（图像灵感更聚焦）</li>
        <li>📦 接入 <strong>X (Twitter) AI 视频热门</strong></li>
        <li>📦 <strong>个人收藏</strong> — 给每条作品打星，本地收藏夹</li>
        <li>📦 <strong>趋势分析</strong> — 本周哪些 prompt 关键词最热，自动汇总</li>
      </ul>
    </HelpSection>
  );
}
