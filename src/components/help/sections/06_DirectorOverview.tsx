import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";
import { CodeBlock } from "../ui/CodeBlock";

export function Sec06DirectorOverview() {
  return (
    <HelpSection id="director-overview" no="06" title="导演台 R2V · 工作流概览" group="导演台 R2V">
      <p className="lead">
        导演台是 Frame/0 的<strong>项目化工作流</strong>。它从工坊上方拉出一个抽屉式 overlay，
        提供&quot;一组参考图 + 5 要素 + 卖点 + 多版本 prompt + 历史视频&quot;的完整封装，可保存草稿、可下次继续。
      </p>

      <H3 id="director-when">什么时候用导演台</H3>
      <ul>
        <li>需要<strong>多次提交</strong>同一组参考图做 A/B（工坊每次都要重新填）</li>
        <li>需要<strong>跨段连续性</strong>（5 段 UGC 用同一组人物 / 产品 / 场景）</li>
        <li>需要<strong>多人协作或归档</strong>（项目可保存到本地磁盘，跨设备同步）</li>
        <li>需要<strong>结合 Claude Code skill 写 prompt</strong>（<a href="#file-bridge">文件桥</a>）</li>
      </ul>
      <p>反之，<strong>单条任务</strong>或<strong>纯文字 T2V</strong>，工坊更轻量。</p>

      <H3 id="director-layout">界面结构</H3>
      <CodeBlock title="导演台抽屉的 4 个区">
{`┌─ 导演台 R2V Workspace (抽屉) ─────────────────────────┐
│ ┌─ R2VSidebar 项目列表 ─┐ ┌─ 顶栏 ────────────────┐  │
│ │ - 项目 A · 5 段 📱     │ │ Mode: 🎬 | 📱        │  │
│ │ - 项目 B · Cinematic 🎬│ │ 选目录并保存          │  │
│ │ + 新项目                │ └──────────────────────┘  │
│ ├───────────────────────┤                              │
│ │ ProjectStepper(三步)  │                              │
│ │ ① 结构化输入 ─ ② Prompt ─ ③ 视频                     │
│ │                                                       │
│ │ ┌─ Card 1 / Card 2 / Card 3 ──┐                      │
│ │ │  (按当前 step 切换)            │                    │
│ │ └────────────────────────────┘                      │
└──────────────────────────────────────────────────────────┘`}
      </CodeBlock>

      <H3 id="director-modes">两种项目模式</H3>
      <p>
        点顶栏 Mode 切换。两种模式的 Card 1/2/3 内容差异较大，但底层数据结构相同（同一项目可在两种模式间切换，不丢数据）。
      </p>
      <ul>
        <li>
          <strong>🎬 单镜大片（Cinematic）</strong> — 单条精品 hero 视频。
          适用品牌 / 高端电商。详见<a href="#director-cinematic">07 章节</a>。
        </li>
        <li>
          <strong>📱 批量短片（UGC）</strong> — 多 chunk 量产 UGC 投流广告。
          适用跨境 / 国内电商。详见<a href="#director-ugc">08 章节</a>。
        </li>
      </ul>

      <H3 id="director-stepper">三步流程</H3>
      <CodeBlock>
{`① 结构化输入 (Card 1)  →  ② Prompt (Card 2)  →  ③ 视频 (Card 3)
    参考图 / 5 要素            AI 流式扩写              R2V 提交 / 链式
    卖点 / 平台 / 技术          + 34 个 preset           UGC 多段并行
                              + 知识模块挂载           + 后期 FFmpeg`}
      </CodeBlock>

      <p>三步之间可<strong>来回切换</strong>，前一步修改后下一步会标记 &quot;待重生&quot;。建议顺序走完一遍，再回去微调。</p>

      <Callout type="tip" title="这 34 个套路，工坊和画布里也能直接用">
        <p>
          不想走完整三步项目流时，<strong>工坊底部对话框的「🎬 导演扩写」</strong>和
          <strong>画布节点内的「🎬 导演」</strong>都内嵌了同一套 34 个 preset：
          选一个套路，AI 当场把你的想法流式扩写成 prompt，就地采用即可生成。
          导演台深度页则适合<strong>多镜 / 多段 / 链式</strong>的复杂工程。
        </p>
      </Callout>

      <H3 id="director-storage">项目存哪里</H3>
      <ul>
        <li><strong>默认（仅当前会话）</strong> — 数据存 Zustand store + localStorage，关浏览器会保留但跨设备不可见</li>
        <li>
          <strong>保存到磁盘（推荐）</strong> — 点顶栏 &quot;选目录并保存&quot;，
          调用 <a href="#file-bridge">File System Access API</a> 让你挑一个目录
          （如 <code>~/Documents/frame-0-projects/</code>），后续所有改动自动写入：
        </li>
      </ul>
      <CodeBlock title="项目目录结构">
{`<your-projects-dir>/
└── <project-id>/
    ├── inputs/                     # 参考图 (原图 + 缩略)
    │   ├── character1.png
    │   └── product1.jpg
    ├── prompts/                    # prompt 历史 (每次扩写一条 .md)
    │   ├── 2026-05-27-1430-r2v.md
    │   └── 2026-05-27-1438-r2v.md
    ├── videos/                     # 生成结果
    │   ├── 2026-05-27-1432-段1.mp4
    │   └── 2026-05-27-1445-段2.mp4
    ├── input.json                  # 给 Claude Code skill 的输入
    ├── prompt.md                   # skill 写回的 prompt
    └── project.json                # 项目元数据
`}
      </CodeBlock>

      <Callout type="tip" title="保存到磁盘的额外好处">
        <p>
          1) 跨设备同步（配合 iCloud / Dropbox 等）<br />
          2) <strong>可被 Claude Code skill 读写</strong> —— 浏览器写 <code>input.json</code>，
              Claude Code 的 <code>video-prompt-generator</code> skill 读取、生成 prompt，写回 <code>prompt.md</code>，
              浏览器自动 watch 并 ingest 回 Card 2。<br />
          3) 资产永久持有 —— localStorage / IndexedDB 可能被浏览器清理，磁盘文件不会。
        </p>
      </Callout>
    </HelpSection>
  );
}
