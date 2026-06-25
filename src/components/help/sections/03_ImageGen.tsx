import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";
import { SpecTable } from "../ui/SpecTable";

export function Sec03ImageGen() {
  return (
    <HelpSection id="image-gen" no="03" title="AI 生图" group="生成能力">
      <p className="lead">
        工坊右侧面板切换到 <strong>生图</strong> Tab，即可通过自然语言生成高质量图像。
        生成的图片可直接 &quot;用作视频首帧&quot;，无缝衔接 I2V 流程。
      </p>

      <H3 id="image-gen-models">可用模型</H3>
      <SpecTable
        headers={["模型 ID", "厂商", "特点", "适用场景"]}
        rows={[
          [<code key="1">qwen-image-2.0-pro</code>, "通义千问", "中英文字渲染最强，超长 prompt 鲁棒", "海报 / 包含文字的设计"],
          [<code key="2">qwen-image-edit</code>, "通义千问", "I2I 局部重绘，保留原图未蒙版区域", "去水印 / 换衣换发色"],
          [<code key="3">wan2.7-image-pro</code>, "通义万相", "写实风格质感强，2K 输出", "电商主图 / 摄影风作品"],
          [<code key="4">wan2.7-image-pro-edit</code>, "通义万相", "I2I 版本，prompt 友好", "产品场景替换"],
          [<code key="5">z-image-turbo</code>, "极图", "极速出图（ETA 8s）", "灵感快速验证、批量草图"],
        ]}
      />

      <H3 id="image-gen-modes">T2I vs I2I</H3>
      <p>
        生图分两种模式，UI 上自动根据是否填了参考图来判断：
      </p>
      <ul>
        <li><strong>T2I（文生图）</strong> — 不填参考图，纯文字驱动。最自由但也最难精确控制。</li>
        <li><strong>I2I（图生图）</strong> — 上传一张原图，文字描述修改方向。
        模型保留原图主体结构，只改 prompt 指定部分。适合微调而非大改。</li>
      </ul>

      <H3 id="image-gen-params">关键参数</H3>
      <SpecTable
        headers={["参数", "取值范围", "建议默认", "影响"]}
        colWidths={["20%", "25%", "20%", "35%"]}
        rows={[
          ["分辨率", "512×512 / 1024×1024 / 2048×2048", "1024×1024", "越高细节越多、时间越久、成本越高"],
          ["画幅", "1:1 / 16:9 / 9:16 / 4:3 / 3:4", "1:1", "决定输出宽高比，会影响构图重心"],
          ["种子 Seed", "0 / 任意整数", "0 (随机)", "固定种子可复现同一张图，便于微调 prompt 后对比"],
          ["批量 N", "1–4", "1", "一次产出多张变体，配合对比挑选"],
          ["Style preset", "写实 / 动漫 / 3D / 油画 / 水彩 / ...", "auto", "比 prompt 写&quot;XX 风格&quot;更稳定"],
          ["Negative prompt", "字符串", "（空）", "屏蔽常见缺陷：糊脸 / 多手 / 文字乱码"],
        ]}
      />

      <H3 id="image-gen-tips">写好生图 prompt</H3>
      <ul>
        <li><strong>主体优先</strong>：第一句必须是&quot;一张 XX 的照片/插画/3D 渲染&quot;，让模型先锁定输出形式。</li>
        <li><strong>描述具体</strong>：&quot;穿黑色羊毛大衣的男生&quot; 远好于 &quot;一个酷的男生&quot;。</li>
        <li><strong>光线说明</strong>：&quot;黄昏侧光&quot;/&quot;棚拍硬光&quot;/&quot;自然漫射光&quot; 能极大改变质感。</li>
        <li><strong>背景留白</strong>：电商图加 &quot;纯白背景，无阴影&quot;，避免 AI 自作主张加场景。</li>
        <li><strong>排除项放 Negative</strong>：&quot;文字水印 / 多余肢体 / 模糊&quot; 等放 Negative prompt，比正向写 &quot;清晰&quot; 更有效。</li>
      </ul>

      <H3 id="image-gen-bridge">桥接到 I2V</H3>
      <p>
        每张生成的图片下方都有一个 &quot;用作视频首帧 →&quot; 按钮。点击后：
      </p>
      <ol>
        <li>自动跳到 <code>I2V</code> Tab</li>
        <li>该图片自动填入首帧槽位（含本地 IDB 缓存，免重复上传）</li>
        <li>原 prompt 会被默认带过去作为视频 prompt 的&quot;锚&quot;</li>
        <li>你只需补充&quot;镜头如何运动&quot; 即可提交</li>
      </ol>

      <Callout type="tip" title="生图与生视频的协同模式">
        <p>
          高级用法：先用 <code>qwen-image-2.0-pro</code> 跑 4 张同 prompt 变体 → 挑最满意的 1 张 →
          点 &quot;用作视频首帧&quot; → 用 <code>happyhorse-1.0-i2v</code> 让它动起来。
          这条路径质量明显高于直接 T2V，因为首帧锚定避免了 AI 在 0 帧自由发挥的随机性。
        </p>
      </Callout>
    </HelpSection>
  );
}
