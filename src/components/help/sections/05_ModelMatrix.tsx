import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";
import { SpecTable } from "../ui/SpecTable";

export function Sec05ModelMatrix() {
  return (
    <HelpSection id="model-matrix" no="05" title="模型矩阵" group="生成能力">
      <p className="lead">
        Frame/0 接入 <strong>5 个厂商 / 6 个模式 / 20+ 个模型变体</strong>，经百炼协议统一聚合。
        <strong>无厂商偏好原则</strong> —— 用哪家由场景、卖点、画质档位决定，不绑死单一模型。
      </p>

      <H3 id="model-matrix-table">完整模型表</H3>
      <SpecTable
        headers={["厂商 Vendor", "模型 ID", "模式", "备注"]}
        colWidths={["18%", "30%", "12%", "40%"]}
        rows={[
          [<strong key="hh">HappyHorse（主打）</strong>,
           <><code>happyhorse-1.0-t2v</code> / <code>-i2v</code> / <code>-r2v</code> / <code>-video-edit</code></>,
           "t2v / i2v / r2v / ve",
           "走主 DashScope 域 · 720P/1080P · 3–15s · r2v 支持 1–9 张参考图"],
          [<strong key="w27">Wan（通义万相）</strong>,
           <><code>wan2.7-t2v</code> / <code>-i2v</code> / <code>-flf</code> / <code>-video-extend</code> / <code>-videoedit</code> / <code>-image-pro</code> / <code>-image-pro-edit</code></>,
           "t2v / i2v / t2i / i2i / ve",
           "新 HTTP 协议（wan27）· 首帧/首尾帧/视频续写/驱动音频 · 支持多模态输入"],
          [<>Wan</>,
           <><code>wan2.6-t2v</code> / <code>-i2v</code> / <code>-i2v-flash</code> / <code>-r2v</code> / <code>-r2v-flash</code></>,
           "t2v / i2v / r2v",
           "旧 SDK 风格协议（wan26）· -flash 变体出图更快"],
          [<strong key="pv">PixVerse</strong>,
           <><code>pixverse-v5.6-t2v</code> / <code>-it2v</code> / <code>-r2v</code></>,
           "t2v / i2v / r2v",
           "360P–1080P 多档位 · 适合移动端场景"],
          [<strong key="kl">Kling</strong>,
           <><code>kling-v3-video-generation</code> / <code>-i2v</code></>,
           "t2v / i2v",
           "Standard / Pro 两档画质"],
          [<strong key="qw">Qwen</strong>,
           <><code>qwen-image-2.0-pro</code> / <code>qwen-image-edit</code></>,
           "t2i / i2i",
           "中英文字渲染最强（海报 / UI 内文字）"],
          [<strong key="zi">Z-Image</strong>,
           <><code>z-image-turbo</code></>,
           "t2i",
           "极速出图（8s ETA）· 适合灵感快速验证"],
        ]}
      />

      <H3 id="model-matrix-protocol">协议族</H3>
      <p>
        所有模型经 Frame/0 内部 <code>ModelSpec.protocol</code> 字段路由到不同的 HTTP payload 构造方式：
      </p>
      <SpecTable
        headers={["协议", "覆盖模型", "特点"]}
        rows={[
          [<code key="1">wan27</code>, "wan 2.7 系列", "新 HTTP 协议，自然语言多镜头描述"],
          [<code key="2">wan26</code>, "wan 2.6 系列", "旧 SDK 风格协议"],
          [<code key="3">pixverse</code>, "pixverse-v5.6 系列", "厂商私有 payload"],
          [<code key="4">kling</code>, "kling-v3 系列", "Standard/Pro 双档配置"],
          [<code key="5">image</code>, "所有 t2i/i2i 模型", "统一图像协议"],
          [<code key="6">(default)</code>, "happyhorse 系列", "DashScope 主域默认协议"],
        ]}
      />

      <H3 id="model-matrix-mapping">跨模型映射</H3>
      <p>用户层无感的两个映射函数，在&quot;视频延续&quot;和&quot;链式生成&quot;场景中自动转换模型：</p>
      <ul>
        <li>
          <code>getI2VVariant(modelId)</code> — 视频续写时，从 R2V/T2V 模型自动取对应的 I2V 变体。
          例：用户在用 <code>happyhorse-1.0-r2v</code>，链式生成段 2 时自动切到 <code>happyhorse-1.0-i2v</code> 取尾帧续写。
        </li>
        <li>
          <code>getR2VVariant(modelId)</code> — 链式生成段 2+，从 T2V 模型映射到对应的 R2V 变体，
          配合角色锚点 + 上段尾帧保证连续性。
        </li>
      </ul>

      <H3 id="model-matrix-choosing">怎么选模型</H3>
      <SpecTable
        headers={["场景", "推荐模型", "原因"]}
        rows={[
          ["首选 / 不知道选哪个", <code key="1">happyhorse-1.0-i2v</code>, "质量稳定 · 价格中等 · R2V 也覆盖"],
          ["高端品牌 hero", <span key="2"><code>happyhorse-1.0-r2v</code>{" + "}<code>-i2v</code> 链式</span>, "单镜大片模式默认搭配"],
          ["UGC 量产", <span key="3"><code>happyhorse-1.0-i2v</code> 并行 N 段</span>, "速度优先 · 批量短片模式默认"],
          ["竖屏短视频 (9:16)", <code key="4">pixverse-v5.6-i2v</code>, "PixVerse 对竖屏构图优化好"],
          ["复杂运镜需求", <code key="5">kling-v3-i2v</code>, "运镜词识别度高，能跑出推拉摇移组合"],
          ["海报 / UI 含文字", <code key="6">qwen-image-2.0-pro</code>, "中英文字渲染最准"],
          ["快速试参考构图", <code key="7">z-image-turbo</code>, "8 秒出图，可批量试 4–6 张"],
        ]}
      />

      <Callout type="info" title="无厂商偏好原则">
        <p>
          Frame/0 不会因为某厂商赞助、合作或商务关系优先推荐它的模型。
          所有推荐建议都是基于<strong>真实质量、价格、场景适配度</strong>的工程判断。
          想要客观对比？打开 <a href="#compare">对比台</a>，同一 prompt 跑 3–5 个模型并排出片，
          自己判断哪家最适合你的场景。
        </p>
      </Callout>

      <Callout type="tip" title="新模型接入路线">
        <p>
          Frame/0 持续观察新模型，凡符合以下条件的优先接入：
          (1) 能走百炼协议；
          (2) 单条成本 ≤ ¥5；
          (3) 720P 以上画质；
          (4) 支持 5s 以上时长。
          欢迎在 <code>PRODUCT.md</code> 反馈你想加的模型。
        </p>
      </Callout>
    </HelpSection>
  );
}
