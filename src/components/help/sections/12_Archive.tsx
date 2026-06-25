import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";
import { SpecTable } from "../ui/SpecTable";

export function Sec12Archive() {
  return (
    <HelpSection id="archive" no="12" title="档案中心 Archive" group="后期与归档">
      <p className="lead">
        所有创作成果 —— 视频、图片、prompt、完整参数 —— 自动归档，随时回溯。
        三种视图模式覆盖不同浏览需求。带 <strong>C2PA 已发布标记</strong>，可追溯哪些作品已上线投流。
      </p>

      <H3 id="archive-views">三种视图模式</H3>
      <SpecTable
        headers={["视图", "布局", "适用"]}
        rows={[
          ["编辑式 Editorial", "大缩略图 + 完整元数据", "深度审阅单条作品"],
          ["网格 Grid", "等大方块缩略图", "快速浏览大量作品"],
          ["胶片条 Filmstrip", "横向滚动单行", "对比同一项目的连续多段"],
        ]}
      />
      <p>顶栏切换，记忆上次偏好。</p>

      <H3 id="archive-snapshot">完整快照记录</H3>
      <p>每次生成自动记录的字段：</p>
      <ul>
        <li><strong>Prompt</strong> 全文（含 negative prompt）</li>
        <li><strong>模型版本</strong> + 协议族 + 提交时的具体 model id</li>
        <li><strong>分辨率 / 时长 / 比例</strong></li>
        <li><strong>种子值 Seed</strong>（便于复现）</li>
        <li><strong>参考图列表</strong> + 每张的 role 标签</li>
        <li><strong>提交时间 + 完成时间 + 耗时</strong></li>
        <li><strong>百炼 task_id</strong>（可回查百炼后台）</li>
      </ul>

      <H3 id="archive-filter">筛选与搜索</H3>
      <SpecTable
        headers={["筛选维度", "选项"]}
        rows={[
          ["时间", "今日 / 本周 / 本月 / 自定义"],
          ["模型", "全部 / HappyHorse / Wan / PixVerse / Kling / ..."],
          ["模式", "T2V / I2V / R2V / T2I / I2I / VE"],
          ["状态", "全部 / 运行中 / 已完成 / 失败"],
          ["标签", "按你给资产打的标签筛选（点卡片上的标签即筛）"],
          ["关键词", "搜 prompt 文本 / 标题 / 模型 ID / 标签"],
        ]}
      />

      <H3 id="archive-actions">单条作品操作</H3>
      <p>每条作品都有快捷操作菜单：</p>
      <ul>
        <li><strong>↻ 重新生成</strong> — 保留所有原始参数提交新任务（同 seed 复现，或 seed=0 随机变体）</li>
        <li><strong>🎞 / ✂ 复用</strong> — 图成片→i2v 生视频；视频成片→送剪辑 / 编辑</li>
        <li><strong>⊞ 放到画布</strong> — 成片落为画布节点，作分支创作的起点</li>
        <li><strong>🎭 送导演台</strong> — 成片作角色参考，进 R2V 多镜创作</li>
        <li><strong>✎ 编辑</strong> — 改名 / 加删标签 / 写备注，整理你的资产</li>
        <li><strong>📋 复制 prompt</strong> — 一键 copy 完整 prompt 到剪贴板</li>
        <li><strong>📂 在文件管理器打开</strong> — 跳到 <code>data/videos/</code> 下的本地文件</li>
        <li><strong>🔗 复制百炼 task_id</strong> — 可去百炼后台查任务详情</li>
        <li><strong>❌ 删除</strong> — 仅删档案记录，本地文件保留（防误删）</li>
      </ul>

      <H3 id="archive-upload">上传素材 + 录入外部</H3>
      <p>资产库不只承载 Frame/0 生成的内容，也是你的<strong>素材库</strong>：</p>
      <ul>
        <li>
          <strong>⬆ 上传素材</strong> —— 本地图片 / 视频直接上传（或把文件拖到资产库网格）。
          被用作 i2v 首帧 / r2v 参考时会自动重传 OSS，可直接拿去生成。
        </li>
        <li><strong>+ 录入</strong> —— 用 URL 录入第三方视频（客户参考片、其他工具产出）。</li>
        <li><strong>导入 JSON</strong> —— 从清单批量导入。</li>
      </ul>

      <H3 id="archive-edit">编辑打标</H3>
      <p>
        点卡片「✎」编辑：<strong>改名 / 加删标签 / 写备注</strong>。标签纯手动，但加标签时会把
        <strong>已用过的标签当建议</strong>，点一下就加、不用重打；卡片上的标签点一下即按它筛选 ——
        让资产库真正可整理、可检索，而不只是展示。
      </p>

      <Callout type="info" title="C2PA 已发布标记">
        <p>
          投流团队可在档案里给作品打 &quot;已发布&quot; 标签，记录发布平台、日期、链接。
          后续看到效果好的作品想复刻，能秒级回到当时的 prompt + 参数组合，
          不会因为 &quot;到底是哪一版的?&quot; 浪费半小时。
        </p>
      </Callout>
    </HelpSection>
  );
}
