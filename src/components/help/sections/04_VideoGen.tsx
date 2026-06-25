import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";
import { SpecTable } from "../ui/SpecTable";
import { CodeBlock } from "../ui/CodeBlock";

export function Sec04VideoGen() {
  return (
    <HelpSection id="video-gen" no="04" title="AI 生视频" group="生成能力">
      <p className="lead">
        Frame/0 的核心能力。三种生成模式，覆盖 &quot;从零创作&quot; 到 &quot;基于多参考精确控制&quot; 的全链路。
        模式选择直接决定可用模型、参数表单、提交后端协议。
      </p>

      <H3 id="video-gen-3modes">三种模式对比</H3>
      <SpecTable
        headers={["模式", "输入", "适用场景", "典型时长", "成本相对"]}
        colWidths={["10%", "25%", "30%", "15%", "20%"]}
        rows={[
          [<code key="t">T2V</code>, "纯文字", "概念实验 / 风景 / 抽象镜头 / 无具体主体的画面", "5s / 10s", "★ 最低"],
          [<code key="i">I2V</code>, "1 张图 + 文字", "&quot;让图动起来&quot;：产品 360 转 / 人像表情动 / 风景延时", "5s / 10s", "★★ 中"],
          [<code key="r">R2V</code>, "1–9 张图 + 文字 (可选参考视频)", "角色锁定 / 风格迁移 / 复刻运镜 / 跨段一致", "5–15s", "★★★ 高"],
        ]}
      />

      <H3 id="video-gen-t2v">T2V · 文生视频</H3>
      <p>
        最简单的入口。模型完全靠 prompt 想象画面，自由度高但可控性低。
        典型场景：探索新概念、生成抽象画面、风景延时。<strong>不适合</strong>需要保持特定人物或产品形态的场景
        （那是 I2V / R2V 的强项）。
      </p>
      <CodeBlock title="T2V Prompt 示范" lang="prompt">
{`一座漂浮在云海之上的水晶城堡，黄昏紫红色霞光从右侧斜照过来。
镜头：缓慢推近 (slow push-in)，从全景到城堡正面中景，5 秒。
氛围：宁静神秘，史诗感，宫崎骏画风。`}
      </CodeBlock>

      <H3 id="video-gen-i2v">I2V · 图生视频</H3>
      <p>
        上传 <strong>1 张</strong> 图作为视频首帧 (frame 0)，模型从首帧延展出后续画面。
        这是平衡可控性与简单性的最佳选择，也是大多数场景的首选。
      </p>
      <p>I2V 模型本质上是&quot;让首帧动起来&quot;：</p>
      <ul>
        <li>首帧的产品 / 人物 / 构图 / 颜色 — <strong>会被忠实保留</strong></li>
        <li>Prompt 主要描述 <strong>镜头运动、动作变化、光照演变</strong>，而不是描述首帧本身</li>
        <li>不要 prompt 里描述&quot;一个穿红衣服的女生&quot; — 这她已经在图里了</li>
      </ul>
      <CodeBlock title="I2V Prompt 示范" lang="prompt">
{`镜头从中景缓慢推近 (slow push-in)，5 秒。
女孩缓缓抬起头看向镜头，发丝被风轻拂。
氛围：夕阳暖光，浅景深，电影感。`}
      </CodeBlock>

      <H3 id="video-gen-r2v">R2V · 参考图生视频</H3>
      <p>
        最强大也最复杂。一次可上传 <strong>1–9 张</strong> 参考图，每张图有自己的角色 / 用途：
      </p>
      <SpecTable
        headers={["角色 role", "用途"]}
        colWidths={["25%", "75%"]}
        rows={[
          [<code key="1">character</code>, "人物锁定（最常用，跨镜头保持同一张脸）"],
          [<code key="2">product</code>, "产品锁定（形态 / 颜色 / 材质保留）"],
          [<code key="3">scene</code>, "场景锁定（背景 / 环境一致）"],
          [<code key="4">style</code>, "风格参考（色调 / 笔触迁移）"],
          [<code key="5">outfit</code>, "服装锁定（衣物 / 配色 / 纹理）"],
          [<code key="6">logo</code>, "品牌 logo 元素锁定"],
          [<code key="7">prop</code>, "道具锁定（手持物件等）"],
          [<code key="8">effect</code>, "特效模板（光斑 / 粒子 / 转场）"],
          [<code key="9">packaging</code>, "包装锁定"],
        ]}
      />
      <p>
        在 prompt 中用 <code>character1</code> / <code>character2</code> / <code>product1</code> 等标识符引用具体参考图。
        例：&quot;<code>character1</code> 拿着 <code>product1</code> 走在 <code>scene1</code> 的街道上&quot;。
      </p>
      <Callout type="warn" title="R2V 的常见误区">
        <p>
          1) <strong>不要传过多角色</strong>：超过 3 个 character 模型会混淆。先精简到最核心的 1–2 个。<br />
          2) <strong>不要混用对立风格</strong>：style 参考是水彩，product 参考是 3D 渲染 — 模型会输出怪异质感。<br />
          3) <strong>不要省略 prompt</strong>：参考图给&quot;长什么样&quot;，prompt 给&quot;做什么动作&quot;，缺一不可。
        </p>
      </Callout>

      <H3 id="video-gen-flf">首尾帧生视频 · First &amp; Last Frame</H3>
      <p>
        万相 2.7 新能力。同时上传<strong>首帧</strong>和<strong>尾帧</strong>两张图，模型自动生成中间的过渡视频。
        适合需要精确控制起止画面的场景：
      </p>
      <ul>
        <li><strong>产品展示</strong> — 首帧正面、尾帧侧面，模型自动生成 360° 旋转</li>
        <li><strong>表情变化</strong> — 首帧微笑、尾帧大笑，模型补全中间表情渐变</li>
        <li><strong>场景转换</strong> — 首帧白天、尾帧夜晚，模型生成日落过渡</li>
        <li><strong>运镜控制</strong> — 首帧远景、尾帧特写，模型自动推近</li>
      </ul>
      <p>
        选择模型 <code>Wan 2.7 · 首尾帧生视频</code>，上传区会自动联动显示两个图片上传框。
        两张图都是必填项。
      </p>

      <H3 id="video-gen-extend">视频续写 · Video Extend</H3>
      <p>
        万相 2.7 新能力。上传一段<strong>首段视频</strong>（2-10 秒），模型基于视频内容自动续写后续画面。
        总时长由 <code>duration</code> 参数控制（最长 15 秒）。
      </p>
      <ul>
        <li><strong>延长精彩片段</strong> — 短片不够长，让模型接着往下演</li>
        <li><strong>故事续写</strong> — 配合 prompt 引导后续情节发展方向</li>
        <li><strong>可选尾帧约束</strong> — 同时上传尾帧图，模型在续写的同时确保最终收尾到指定画面</li>
      </ul>
      <p>
        选择模型 <code>Wan 2.7 · 视频续写</code>，上传区联动显示：视频上传（必填）+ 尾帧图片（可选）。
      </p>

      <H3 id="video-gen-audio">驱动音频 · Driving Audio</H3>
      <p>
        万相 2.7 全系列模型支持上传<strong>驱动音频</strong>（mp3/wav，2-30 秒）：
      </p>
      <ul>
        <li><strong>口型同步</strong> — 上传对白音频，模型自动对齐嘴型</li>
        <li><strong>动作卡点</strong> — 上传节奏强烈的音乐，模型跟节拍生成动作</li>
        <li><strong>不传也行</strong> — 不上传时模型自动生成匹配的背景音乐或音效</li>
      </ul>
      <p>
        选择 Wan 2.7 系列的 T2V / I2V / 首尾帧 / 视频续写模型后，上传区都会显示一个可选的音频上传控件。
        直接拖入 mp3/wav 文件即可，和上传图片/视频操作一致。
      </p>

      <H3 id="video-gen-job">任务生命周期</H3>
      <p>
        提交后台流程（左侧任务列表实时反映状态变化）：
      </p>
      <CodeBlock>
{`SUBMIT → PENDING → SUBMITTING → RUNNING (轮询中) → SAVING → DONE
                                       ↓
                                    FAILED (可点 ↻ 重试)`}
      </CodeBlock>
      <ul>
        <li><strong>SUBMITTING</strong> ≤ 5s：把参数推给百炼，拿到 task_id</li>
        <li><strong>RUNNING</strong> 60–180s：百炼侧实际推理 + 渲染</li>
        <li><strong>SAVING</strong> ≤ 10s：自动下载到 <code>data/videos/</code>，建本地索引</li>
        <li><strong>DONE</strong>：任务卡变绿，自动弹出预览，可送剪辑或归档</li>
      </ul>

      <Callout type="info" title="任务状态可恢复">
        <p>
          所有任务通过 <strong>IndexedDB + localStorage</strong> 双重持久化。
          关闭浏览器、刷新页面、甚至重启电脑后再打开，所有正在跑的任务都会自动继续轮询，
          已完成的任务结果完整保留，不会丢失任何进度。
        </p>
      </Callout>

      <H3 id="video-gen-compose-boost">工坊对话框的两个加速</H3>
      <p>底部对话框里就地把 prompt / 媒体准备好，不用跳来跳去：</p>
      <ul>
        <li>
          <strong>🎬 导演扩写</strong> —— 写句粗想法，点导演弹出 34 个场景套路预设
          （电商爆款 / 电影质感 / 美妆 / UGC…），选一个套路后 AI 按它流式扩写成专业 prompt，
          预览对比、满意再采用；另有「自由发挥」= 不套套路。画布节点内同款。
        </li>
        <li>
          <strong>⊞ 从资产库选媒体</strong> —— i2v 首帧 / r2v 参考图的上传槽，点「＋」可选
          「本地文件」或「资产库」，直接挑一张已生成 / 已上传的素材当输入（自动重传 OSS）。
        </li>
      </ul>
      <Callout type="info" title="必填媒体会拦在提交前">
        <p>
          i2v 缺首帧、ve 缺视频、r2v 缺参考图时，点生成会提示「还缺：…」并拦下，
          不会白白提交后才吃服务端「Field required」的报错。
        </p>
      </Callout>
    </HelpSection>
  );
}
