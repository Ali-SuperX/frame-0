import { HelpSection, H3 } from "../HelpSection";

const TERMS: { zh: string; en: string; desc: string }[] = [
  { zh: "工坊", en: "Studio", desc: "主工作台，任务化模型调用。一次填参数 → 一个 Job，完了入档案。" },
  { zh: "导演台", en: "R2V Workspace", desc: "抽屉式 overlay，项目化的 R2V 工作流（多次提交、保存草稿、文件桥）。" },
  { zh: "模式", en: "Mode", desc: "t2v 文生视频 / i2v 图生视频 / r2v 参考生视频 / t2i 文生图 / i2i 图生图 / ve 视频编辑。" },
  { zh: "项目", en: "Project", desc: "导演台的单位 — 一组参考图 + 5 要素 + 卖点 + 多版本 prompt + 历史视频。" },
  { zh: "任务", en: "Job", desc: "工坊的单位 — 一次模型调用，带轮询状态（pending / running / done / failed）。" },
  { zh: "单镜大片", en: "Cinematic", desc: "R2V 项目模式之一，单条精品 hero 视频（品牌 / 高端电商）。原名 Cinematic。" },
  { zh: "批量短片", en: "UGC", desc: "R2V 项目模式之一，多 chunk 量产 UGC 投流广告（跨境电商）。原名 UGC。" },
  { zh: "段", en: "Chunk", desc: "「批量短片」模式的分段，典型 5-7 段 × 6 秒，带独立 voiceover 和 framing。" },
  { zh: "通用锚点", en: "Universal Blocks", desc: "UGC 跨段一致性锚 — characterLock / actionDirection / realismBlock / excludeBlock。" },
  { zh: "钩子框架", en: "Hook Framework", desc: "UGC 钩子分类（10 类：problem-aware / shock / question / comparison / ...）。" },
  { zh: "锚点策略", en: "Anchor Strategy", desc: "长视频链式策略 — r2v-chain / i2v-bridge / hybrid。" },
  { zh: "文件桥", en: "File Bridge", desc: "浏览器写 input.json → Claude Code skill 读取 → 写回 prompt.md → 浏览器 watch 并 ingest。" },
  { zh: "五要素", en: "Five Elements (Verum)", desc: "character / identity / outfit / environment / vibe — 单镜大片模式跨镜头一致性核心约束。" },
  { zh: "卖点锚点", en: "Selling Point Anchor", desc: "抽象卖点（&quot;显瘦 / 通透 / 丝滑&quot;）→ 自动翻译成可视化镜头描述。" },
  { zh: "预设", en: "Preset", desc: "Card 2 里的 34 个&quot;AI 生成配置捆绑包&quot;，按场景挂载不同知识模块。" },
  { zh: "百炼", en: "Bailian DashScope", desc: "阿里云 AI 模型聚合平台，Frame/0 所有视频模型的统一后端。" },
  { zh: "OSS sidecar", en: "OSS Sidecar", desc: "可选第 4 层兜底，K8s 多副本部署 + PVC 故障时自动 302 到 OSS 签名 URL。" },
  { zh: "缩略 base64", en: "thumbDataUrl", desc: "240px 缩略图编码为 data: base64 URL，存 localStorage，即时预览不需网络。" },
  { zh: "本地原文件", en: "localKey → IDB", desc: "全分辨率原文件存 IndexedDB，Lightbox 放大、剪辑导入用。" },
  { zh: "服务器镜像", en: "localPath", desc: "/api/uploads/&lt;sha&gt;.&lt;ext&gt; 服务器侧文件镜像，跨设备共享 + 防清缓存。" },
  { zh: "stale URL refresh", en: "refreshStaleMedia()", desc: "百炼 oss://dashscope-instant URL 跨天失效，自动从本地源重新上传。" },
  { zh: "配额安全存储", en: "quotaSafeStorage", desc: "包装原生 localStorage，超限时自动 GC 老数据避免 QuotaExceededError。" },
  { zh: "缩略图生成", en: "makeThumb()", desc: "双路径解码：createImageBitmap 优先、Image 元素兜底，生成 240px 缩略。" },
  { zh: "尾帧延续", en: "i2v-bridge", desc: "长视频策略 — 段 1 R2V，段 2+ 用上段尾帧做 I2V 首帧。" },
  { zh: "VL 描述", en: "VL Description", desc: "Vision Language Model 自动给参考图生成 prompt 友好的文字描述（Qwen 3 VL）。" },
  { zh: "对比台", en: "Compare", desc: "同 prompt 横跨多模型并排出片，三大支柱之一。" },
  { zh: "档案", en: "Archive", desc: "全生产成果归档，含完整参数快照，可一键重生 / 喂剪辑。" },
  { zh: "C2PA 已发布", en: "C2PA Published Mark", desc: "档案里给作品打&quot;已发布&quot;标签，记录发布平台 / 日期 / 链接。" },
];

export function Sec19Glossary() {
  return (
    <HelpSection id="glossary" no="19" title="术语表" group="运维参考">
      <p className="lead">
        Frame/0 文档与界面里用到的所有专有名词。中文 + 英文双语 + 一句话解释。按中文笔画顺序排列。
      </p>

      <H3 id="glossary-list">A–Z / 笔画</H3>
      <div className="help2-glossary">
        {TERMS.map((t) => (
          <div key={t.zh} className="help2-glossary-item">
            <p className="help2-glossary-term">
              {t.zh}
              <span className="help2-glossary-en">{t.en}</span>
            </p>
            <p className="help2-glossary-desc" dangerouslySetInnerHTML={{ __html: t.desc }} />
          </div>
        ))}
      </div>
    </HelpSection>
  );
}
