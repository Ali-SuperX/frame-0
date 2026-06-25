import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";
import { SpecTable } from "../ui/SpecTable";
import { CodeBlock } from "../ui/CodeBlock";

export function Sec15Persistence() {
  return (
    <HelpSection id="persistence" no="15" title="数据持久化" group="数据与集成">
      <p className="lead">
        Frame/0 用 <strong>4 层冗余存储</strong>保护你的素材和数据。任何一层挂掉都不影响预览。
        理解这套机制对排查&quot;为什么我的图打不开了&quot;之类的问题至关重要。
      </p>

      <H3 id="persistence-layers">4 层存储</H3>
      <SpecTable
        headers={["层", "存什么", "存哪", "存活时长", "用途"]}
        rows={[
          ["1. thumbDataUrl", "240px base64 缩略图", "localStorage", "永久（除非清浏览器）", "即时预览，不需要网络/IDB"],
          ["2. localKey → IDB", "全分辨率原图", "IndexedDB", "永久（除非清浏览器）", "Lightbox 放大、剪辑导入"],
          ["3. localPath", "服务器镜像 /api/uploads/<sha>.<ext>", "data/uploads/ 磁盘", "永久（除非删服务器）", "最稳，多设备共享"],
          ["4. oss:// (可选)", "阿里云 OSS 签名 URL", "阿里云 OSS bucket", "长期（按 OSS 计费）", "K8s 多副本部署 + PVC 故障兜底"],
        ]}
      />

      <H3 id="persistence-priority">读取优先级</H3>
      <p>
        所有图片/视频展示组件按以下顺序尝试：
      </p>
      <CodeBlock title="MediaTile 渲染优先级">
{`1. previewUrl (blob:)        ← 本会话上传，最快但 reload 会丢
2. rehydrated blob (来自 IDB) ← 关闭重开，从 IDB 重建 blob:
3. localPath (/api/uploads)   ← 服务器镜像，最稳
4. thumbDataUrl (data:base64) ← 兜底，至少能看
5. url (oss:// / https://)    ← 最后尝试，可能挂

任一项成功即停止后续尝试`}
      </CodeBlock>

      <H3 id="persistence-localstorage">localStorage 容量危险</H3>
      <Callout type="warn" title="QuotaExceededError 触发条件">
        <p>
          浏览器 localStorage 通常 5–10 MB 上限。如果用户上传图片<strong>不当持久化</strong>在 zustand persist 里
          会触发 <code>QuotaExceededError</code>，整个 store 写入失败导致状态丢失。
        </p>
        <p>
          Frame/0 已用以下机制保护：
        </p>
        <ul>
          <li><code>stripForStorage()</code> — 持久化前自动剥离大字段（previewUrl / 全分辨率 data:）</li>
          <li><code>quotaSafeStorage()</code> Proxy — 包装原生 localStorage，超限时自动 GC 老数据</li>
          <li>jobs MAX_PERSISTED — 任务列表只保留最新 N 条，老的转入 IndexedDB</li>
        </ul>
      </Callout>

      <H3 id="persistence-stale-oss">stale OSS URL 自动 refresh</H3>
      <p>
        百炼 DashScope 的 <code>oss://dashscope-instant/</code> URL 有<strong>临时性</strong> ——
        URL 里嵌入日期 (<code>/&lt;YYYY-MM-DD&gt;/...</code>)，过一天后 DashScope GC 掉对象，URL 失效。
        触发症状："OSS Resource ... not exist"。
      </p>
      <p>
        Frame/0 在提交前的 <code>refreshStaleMedia()</code> 会自动检测：
      </p>
      <CodeBlock>
{`如果 oss:// URL 日期 < 今天:
  1. 从 IDB / localPath / thumbDataUrl 三个本地源依次找回原图
  2. 重新上传到 OSS，拿到新 URL
  3. 替换 store 中的 oss:// URL，用户无感
  4. 若所有本地源都失败 → 弹 &quot;请重新上传&quot; 提示`}
      </CodeBlock>
      <p>这意味着<strong>跨天复用素材</strong>是安全的，不需要手动重传。</p>

      <H3 id="persistence-server-mirror">服务器镜像</H3>
      <p>
        每次上传图片，<code>/api/bailian/upload</code> 路由除了往 OSS 推之外，
        还会在本机 <code>data/uploads/&lt;sha&gt;.&lt;ext&gt;</code> 留一份镜像。这层镜像的好处：
      </p>
      <ul>
        <li>跨设备 — 同账户从另一台电脑也能拉到</li>
        <li>跨清缓存 — 用户手动清浏览器数据后，镜像仍在</li>
        <li>免去 OSS 重传 — 同 sha 的图片二次上传时直接复用镜像，不消耗 OSS 流量</li>
      </ul>

      <H3 id="persistence-oss-sidecar">OSS Sidecar（可选）</H3>
      <p>
        K8s 多副本 + PVC 共享部署场景下，开启 <code>OSS_ENABLED=true</code> 启用第 4 层兜底。
        当本地镜像缺失（Pod 重启 / PVC 故障）时，URL 自动 302 redirect 到阿里云 OSS 签名 URL。
        默认<strong>关闭</strong>，单机部署零成本不需要这层。
        详见项目根目录的 <code>deploy/README.md</code> 第九节。
      </p>

      <H3 id="persistence-export">如何彻底备份</H3>
      <p>想把所有素材整体备份到云盘 / 移动硬盘？</p>
      <ol>
        <li>导演台项目 → 已经在你选的项目目录里（File System Access），直接备份该目录</li>
        <li>工坊任务结果 → 服务器镜像在 <code>data/videos/</code>{" + "}<code>data/uploads/</code>，备份这两个文件夹</li>
        <li>任务索引 → <code>data/app-state.json</code>，是 JSON 文件，备份它就能恢复元数据</li>
      </ol>
    </HelpSection>
  );
}
