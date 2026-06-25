import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";
import { SpecTable } from "../ui/SpecTable";

export function Sec17Limits() {
  return (
    <HelpSection id="limits" no="17" title="系统限制" group="运维参考">
      <p className="lead">
        Frame/0 本身几乎没有限制，但底层 <strong>阿里云百炼 DashScope</strong> 和各家模型有硬性约束。
        本节列出所有已知限制 + 对应的报错文案，便于排查。这些限制大多在<strong>客户端上传时即时校验</strong>，
        不会等到任务执行才暴露。
      </p>

      <H3 id="limits-image">图片硬约束（所有上传共享）</H3>
      <SpecTable
        headers={["维度", "限制", "校验时机", "报错文案"]}
        colWidths={["20%", "30%", "20%", "30%"]}
        rows={[
          ["文件大小", "≤ 20 MB (20,971,520 bytes)", "客户端立即",
           <code key="1">File size exceeds maximum allowed size of 20971520 bytes</code>],
          ["最小分辨率", "≥ 300 × 300 px (任一边)", "客户端立即（解码后）",
           <code key="2">image resolution must be at least 300x300</code>],
          ["宽高比", "0.40 ≤ H/W ≤ 2.50", "客户端立即（解码后）",
           <code key="3">input image ratio (H/W=X) must be between 0.40 and 2.50</code>],
          ["格式", "PNG / JPG / WebP / GIF / AVIF / BMP", "上传时", "—"],
          ["RGB 通道", "RGB 或 RGBA（不支持 CMYK / 灰度）", "服务端转换", "—"],
        ]}
      />

      <Callout type="tip" title="客户端预校验">
        <p>
          Frame/0 的 MediaPicker / MediaMultiPicker 在用户选图<strong>瞬间</strong>就跑校验，
          超限文件不会发起任何 <code>/api/bailian/upload</code> 请求。多选场景下，
          合格图正常上传，超限图被跳过并在错误区列出名字。这样避免了&quot;传了 10 张等了 5 分钟才报错&quot;的体验。
        </p>
      </Callout>

      <H3 id="limits-video-duration">视频时长上限（按模型）</H3>
      <SpecTable
        headers={["模型", "可选时长", "默认"]}
        rows={[
          [<code key="1">happyhorse-1.0-t2v</code>, "5 / 10 秒", "5s"],
          [<code key="2">happyhorse-1.0-i2v</code>, "5 / 10 秒", "5s"],
          [<code key="3">happyhorse-1.0-r2v</code>, "5 / 8 / 10 / 13 / 15 秒", "5s"],
          [<code key="4">wan2.7-t2v / -i2v</code>, "5 / 10 秒", "5s"],
          [<code key="5">wan2.6-* / -flash</code>, "3 / 5 秒", "5s"],
          [<code key="6">pixverse-v5.6-*</code>, "5 / 8 秒", "5s"],
          [<code key="7">kling-v3-*</code>, "5 / 10 秒", "5s"],
        ]}
      />
      <p>需要更长视频用<a href="#long-video-chain">链式生成</a>串联，或用「批量短片」模式多段并行。</p>

      <H3 id="limits-r2v-refs">R2V 参考图数量</H3>
      <SpecTable
        headers={["模型", "可选参考图数量"]}
        rows={[
          [<code key="1">happyhorse-1.0-r2v</code>, "1–9 张（最灵活）"],
          [<code key="2">wan2.6-r2v / -r2v-flash</code>, "1–4 张"],
          [<code key="3">pixverse-v5.6-r2v</code>, "1–2 张（仅 character）"],
        ]}
      />
      <Callout type="warn" title="参考图越多不等于效果越好">
        <p>
          实战经验：超过 4 张参考图时模型常常&quot;迷茫&quot;，导致角色 / 场景混淆。
          建议：<strong>character ≤ 2 张、product ≤ 1 张、scene ≤ 1 张、style ≤ 1 张</strong>，
          总数控制在 5 张以内最稳。
        </p>
      </Callout>

      <H3 id="limits-resolution">分辨率档位</H3>
      <SpecTable
        headers={["档位", "像素", "可选模型", "成本相对"]}
        rows={[
          ["360P", "640 × 360", "PixVerse", "★ 最低"],
          ["540P", "960 × 540", "PixVerse", "★"],
          ["720P", "1280 × 720", "全部视频模型", "★★ 主流"],
          ["1080P", "1920 × 1080", "HappyHorse / Wan2.7 / PixVerse / Kling Pro", "★★★ 高"],
          ["2K (图)", "2048 × 2048", "Qwen / Wan2.7 image-pro", "★★ (图片)"],
        ]}
      />

      <H3 id="limits-localStorage">浏览器存储上限</H3>
      <SpecTable
        headers={["存储", "典型容量", "Frame/0 使用"]}
        rows={[
          ["localStorage", "5–10 MB / origin", "<strong>仅存元数据</strong>（任务列表、设置、缩略 base64）"],
          ["IndexedDB", "通常 ≥ 50 MB，配额可申请", "全分辨率原图、视频"],
          ["File System Access", "无限（用户磁盘）", "导演台项目目录"],
        ]}
      />
      <p>如果遇到 <code>QuotaExceededError</code>：</p>
      <ol>
        <li>清掉档案中老的失败任务（顶栏过滤&quot;失败&quot; → 全选 → 删除）</li>
        <li>导出/备份重要项目到磁盘后清 IDB</li>
        <li>切换到隐身窗口可临时绕过容量限制</li>
      </ol>

      <H3 id="limits-api">API Key 调用频率</H3>
      <p>
        阿里云百炼对单个 API Key 有 QPS 限制（具体数值见百炼控制台 → 模型 → 配额）。
        UGC 多段并发提交时可能撞限流，症状是部分段返回 <code>429 Too Many Requests</code>。
        处理方式：
      </p>
      <ul>
        <li>失败段自动延迟重试（Frame/0 已内置退避逻辑）</li>
        <li>升级百炼账户配额（联系阿里云商务）</li>
        <li>降低 UGC 段并发数（设置里把 <code>maxConcurrent</code> 从 5 降到 3）</li>
      </ul>

      <H3 id="limits-browser">浏览器兼容性</H3>
      <SpecTable
        headers={["功能", "Chrome", "Edge", "Safari", "Firefox"]}
        rows={[
          ["基础生成 / 剪辑", "✅", "✅", "✅", "✅"],
          ["File System Access (磁盘项目)", "✅ ≥86", "✅ ≥86", "❌", "❌"],
          ["IndexedDB 高配额", "✅", "✅", "✅ (略低)", "✅"],
          ["FFmpeg.wasm 渲染", "✅", "✅", "✅ (略慢)", "✅"],
          ["chrome-devtools MCP CDP", "✅", "✅", "❌", "❌"],
        ]}
      />
      <p>主推 <strong>Chrome / Edge</strong>，完整体验。Safari 用户文件桥不可用，但其他功能正常。</p>
    </HelpSection>
  );
}
