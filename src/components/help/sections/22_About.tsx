import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";

export function Sec22About() {
  return (
    <HelpSection id="about" no="22" title="关于 Frame/0" group="关于">
      <p className="lead">
        Frame/0 由独立开发者团队维护。本节是项目元信息 + 反馈渠道 + 开源生态。
      </p>

      <H3 id="about-tech">技术栈</H3>
      <ul>
        <li><strong>框架</strong>：Next.js 16（API 与早期版本有破坏性变更）</li>
        <li><strong>视图</strong>：React 19 + TypeScript 5</li>
        <li><strong>状态</strong>：Zustand 5 + localStorage persist</li>
        <li><strong>校验</strong>：Zod 4</li>
        <li><strong>样式</strong>：Tailwind v4</li>
        <li><strong>国际化</strong>：next-intl（中文 / English）</li>
        <li><strong>视频后期</strong>：FFmpeg.wasm 0.12（浏览器内）</li>
        <li><strong>本地存储</strong>：IndexedDB + File System Access API</li>
        <li><strong>模型 API</strong>：阿里云百炼 DashScope</li>
      </ul>

      <H3 id="about-feedback">反馈渠道</H3>
      <ul>
        <li>
          <strong>Bug 报告 / Feature Request</strong>：
          GitHub Issues（仓库地址在项目根目录 README）
        </li>
        <li>
          <strong>使用问题 / 经验交流</strong>：
          官方微信群（扫码或联系管理员）
        </li>
        <li>
          <strong>商务 / 私有部署</strong>：
          官方邮箱 contact@frame-0.io
        </li>
        <li>
          <strong>查看产品完整文档</strong>：
          项目根目录 <code>PRODUCT.md</code>{" + "}<code>AGENTS.md</code>
        </li>
      </ul>

      <H3 id="about-credits">致谢</H3>
      <p>Frame/0 站在巨人的肩膀上：</p>
      <ul>
        <li><strong>阿里云百炼</strong> 提供视频模型的统一接入</li>
        <li><strong>HappyHorse / Wan / PixVerse / Kling / Qwen / Z-Image</strong> 6 家模型团队</li>
        <li><strong>FFmpeg</strong> 浏览器版作者（FFmpeg.wasm）</li>
        <li><strong>Next.js / React / Zustand</strong> 等 OSS 项目</li>
        <li><strong>所有提 Issue / 改 PR 的用户</strong></li>
      </ul>

      <H3 id="about-license">License</H3>
      <p>
        Frame/0 源代码以 AGPL-3.0 协议开源。具体许可证条款见仓库根目录 <code>LICENSE</code> 文件。
        生成的视频版权归用户所有，Frame/0 不主张任何权利。
      </p>

      <H3 id="about-disclaimer">免责声明</H3>
      <Callout type="warn" title="部署与使用责任">
        <p>
          本软件源代码由<strong>阿里云 · 兰柯</strong>独立开发并开源。任何组织或个人基于本项目进行的部署、运营及使用，
          其产生的一切法律责任、数据安全义务及运营风险均由部署方自行承担，与原作者无关。
        </p>
        <p>
          本软件按「现状」（AS-IS）提供，不附带任何明示或暗示的担保，包括但不限于对适销性、
          特定用途适用性及不侵权的担保。详见 <code>LICENSE</code> 文件中的免责条款。
        </p>
      </Callout>

      <H3 id="about-version">版本</H3>
      <ul>
        <li>当前版本：v0.x.x（持续迭代中）</li>
        <li>本文档更新：2026-05-27</li>
        <li>文档源：基于项目 <code>PRODUCT.md</code>（572 行）整理</li>
      </ul>

      <Callout type="tip" title="想深度参与？">
        <p>
          Frame/0 持续招募：(1) <strong>提示词工程师</strong>，补充行业垂类 preset；
          (2) <strong>模型集成开发者</strong>，对接更多视频模型；
          (3) <strong>UI/UX 设计师</strong>，让导演台更易用；
          (4) <strong>内容创作者</strong>，写最佳实践案例。
          联系上方反馈渠道。
        </p>
      </Callout>
    </HelpSection>
  );
}
