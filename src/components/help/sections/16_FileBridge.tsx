import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";
import { CodeBlock } from "../ui/CodeBlock";

export function Sec16FileBridge() {
  return (
    <HelpSection id="file-bridge" no="16" title="文件桥 & Claude Code skill" group="数据与集成">
      <p className="lead">
        Frame/0 的进阶玩法：让浏览器外的 AI agent（Claude Code）来写 prompt，
        浏览器负责跑视频。这套机制叫<strong>文件桥</strong>（File Bridge），
        让两个原本隔离的世界（浏览器 / 终端 CLI）通过磁盘文件交换数据。
      </p>

      <H3 id="bridge-why">为什么需要文件桥</H3>
      <p>
        浏览器内置的 LLM streamChat（Card 2 自动扩写）已经够用大多数场景。
        但当你需要：
      </p>
      <ul>
        <li>用 <strong>自己本地的 Claude Code / Cursor</strong> 写更长更复杂的 prompt</li>
        <li>结合 <strong>自己的 skill 库</strong>（已有的写作模板、知识库）</li>
        <li>对 prompt 走 <strong>git 版本控制</strong>，团队协作</li>
        <li>批量基于 <strong>同一组参考图跑多种 prompt 风格</strong>，外部脚本驱动</li>
      </ul>
      <p>—— 文件桥让这些场景都可行。</p>

      <H3 id="bridge-mechanism">工作原理</H3>
      <CodeBlock title="文件桥的 5 步循环">
{`1. 浏览器 (导演台 Card 2)
   ↓ 写入项目目录
   input.json  ← 当前项目所有结构化输入序列化

2. 用户复制 &quot;/r2v <projectId>&quot; 命令到 Claude Code

3. Claude Code 触发 video-prompt-generator skill
   ↓ 读取
   input.json  → 调用 skill 内置的 prompt 工程逻辑

4. Skill 写入
   prompt.md   ← 完整 prompt（含 negative、镜头脚本、风格描述）

5. 浏览器 watch 项目目录
   ↓ 自动检测 prompt.md 变化
   ingest 到 Card 2 prompt 框，可直接提交`}
      </CodeBlock>

      <H3 id="bridge-prereq">前置条件</H3>
      <ul>
        <li>导演台项目必须<strong>已保存到磁盘</strong>（顶栏 &quot;选目录并保存&quot;）</li>
        <li>本机已安装 <strong>Claude Code CLI</strong></li>
        <li>已安装 <code>video-prompt-generator</code> skill（Anthropic 官方 skill 库）</li>
        <li>浏览器支持 File System Access API（Chrome / Edge ≥ 86，Safari 暂不支持）</li>
      </ul>

      <H3 id="bridge-usage">使用步骤</H3>
      <div className="help2-steps">
        <div className="help2-step">
          <span className="help2-step-num">1</span>
          <div className="help2-step-body">
            <h4>导演台保存项目到磁盘</h4>
            <p>顶栏点&quot;选目录并保存&quot;，挑一个空目录（如 <code>~/Documents/frame-0-projects/baton-ugc/</code>）。
            浏览器写入 <code>input.json</code>{" + "}<code>project.json</code>。</p>
          </div>
        </div>
        <div className="help2-step">
          <span className="help2-step-num">2</span>
          <div className="help2-step-body">
            <h4>复制 skill 命令</h4>
            <p>Card 2 右上角有<strong>复制命令</strong>按钮，粘贴出来是：</p>
            <CodeBlock>{`cd ~/Documents/frame-0-projects/baton-ugc && /r2v`}</CodeBlock>
          </div>
        </div>
        <div className="help2-step">
          <span className="help2-step-num">3</span>
          <div className="help2-step-body">
            <h4>Claude Code 执行</h4>
            <p>在 Claude Code 里粘贴上面命令，触发 <code>video-prompt-generator</code> skill。
            skill 读 <code>input.json</code>，深度思考后写 <code>prompt.md</code>。耗时 30s–2min。</p>
          </div>
        </div>
        <div className="help2-step">
          <span className="help2-step-num">4</span>
          <div className="help2-step-body">
            <h4>浏览器自动 ingest</h4>
            <p>导演台 watch 项目目录，检测到 <code>prompt.md</code> 写入，自动加载到 Card 2 prompt 框，
            顶部 toast 提示&quot;Skill 已写入 prompt&quot;。</p>
          </div>
        </div>
        <div className="help2-step">
          <span className="help2-step-num">5</span>
          <div className="help2-step-body">
            <h4>检查并提交</h4>
            <p>看 prompt 满意 → 直接点&quot;下一步&quot; 进 Card 3 提交。
            不满意 → 手动改 prompt.md 重跑命令，或在 Card 2 里直接编辑。</p>
          </div>
        </div>
      </div>

      <H3 id="bridge-input">input.json 结构</H3>
      <CodeBlock title="给 skill 看的输入" lang="json">
{`{
  "projectId": "baton-ugc",
  "mode": "ugc",
  "framework": "中段-冲击型",
  "fiveElements": {
    "character": "亚洲女性，30 岁，黑色长直发",
    "identity":  "都市白领",
    "outfit":    "黑色羊毛大衣",
    "environment": "夜晚的家中卧室",
    "vibe":      "疲惫但好奇"
  },
  "references": [
    { "role": "product",   "path": "inputs/baton-ultra.png", "vlDesc": "..." },
    { "role": "character", "path": "inputs/model.png",       "vlDesc": "..." }
  ],
  "sellingPoints": ["1800 流明", "单手 EDC", "双模式充电"],
  "platform": "YouTube + 亚马逊",
  "duration": 30,
  "ratio": "16:9",
  "constraints": {
    "noPlasticShine": true,
    "preserveProductProportions": true
  }
}`}
      </CodeBlock>

      <H3 id="bridge-output">prompt.md 结构</H3>
      <CodeBlock title="skill 写回的输出" lang="markdown">
{`# Baton Ultra UGC · 30s · 6 段

## 全局视觉锁定
- 沙漠绿 (#A8956B) 阳极氧化哑光金属手电筒
- 整机长度 12cm，三段比例 1:3:0.7
- USB-C 在尾盖上方机身侧面，磁吸触点在尾盖正中
...

## 段 1 [钩子 · 2s]
[镜头描述]
[voiceover 文本]

## 段 2 [问题觉知 · 4s]
...

## Negative Prompt
warped product, plastic shine, ...`}
      </CodeBlock>

      <H3 id="bridge-skill">video-prompt-generator skill</H3>
      <p>
        这是 Anthropic 官方 skill 库里的视频 prompt 工程 skill。能力：
      </p>
      <ul>
        <li>读 5 要素 + 参考图 vlDesc → 生成镜头脚本</li>
        <li>识别 mode (cinematic / ugc) 走对应模板</li>
        <li>多模型适配（HappyHorse / Wan / PixVerse 各有 prompt 风格差异）</li>
        <li>自动加 Negative Prompt 防止常见缺陷</li>
        <li>支持迭代 — 你给 feedback &quot;改成冷调&quot;，下次重跑会调整</li>
      </ul>

      <Callout type="info" title="文件桥是高级玩法">
        <p>
          90% 的用户用不到文件桥 —— 工坊内置的 streamChat 已经能写出可用 prompt。
          文件桥适合<strong>专业内容生产团队</strong>，对 prompt 质量有高要求、
          或希望把 prompt 写作纳入团队 git 工作流的场景。
        </p>
      </Callout>
    </HelpSection>
  );
}
