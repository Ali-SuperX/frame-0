"use client";

/**
 * 全局页脚 —— 作者署名 + 联系邮箱 + AGPL-3.0 源码链接 + 免责声明。
 *   - 署名 / 邮箱：作者归属与联系方式。
 *   - 源码链接：AGPL §13 合规（网络服务须向用户提供获取源码途径）兼代码指纹。
 *   - 免责声明：部署与使用责任归于部署方。
 *
 * 行为：
 *   - 文档流页面（Manifest / Guide / Help / Archive 等）：滚动到底自然显示。
 *   - 100vh 全屏布局页面（Studio / Editor）：内容撑满视口、无滚动条 → 不显示。
 */
export default function GlobalFooter() {
  return (
    <footer className="gfooter" aria-label="contact">
      <span className="gfooter-text">阿里云 · 兰柯</span>
      <span aria-hidden="true" className="gfooter-sep">
        ｜
      </span>
      <a href="mailto:lanke.cl@alibaba-inc.com" className="gfooter-mail">
        lanke.cl@alibaba-inc.com
      </a>
      <span aria-hidden="true" className="gfooter-sep">
        ｜
      </span>
      <a
        href="https://github.com/ali-lanke/frame-0"
        target="_blank"
        rel="noopener noreferrer"
        className="gfooter-mail"
      >
        Source · AGPL-3.0
      </a>
      <span className="gfooter-disclaimer">
        免责声明：本软件源代码由兰柯开发并开源，平台的部署、运营及使用所产生的一切责任由部署方自行承担，与原作者无关。
      </span>
      <style>{`
        .gfooter {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          padding: 18px 16px;
          font-family: var(--font-mono, monospace);
          font-size: 11.5px;
          letter-spacing: 0.06em;
          color: var(--paper-mute, #999);
          border-top: 1px solid var(--line, rgba(255,255,255,0.08));
          background: var(--ink, transparent);
          flex-wrap: wrap;
        }
        .gfooter-sep { color: var(--paper-mute); opacity: 0.5; }
        .gfooter-mail {
          color: var(--accent, #f5a623);
          text-decoration: none;
        }
        .gfooter-mail:hover { text-decoration: underline; }
        .gfooter-disclaimer {
          width: 100%;
          text-align: center;
          margin-top: 6px;
          font-size: 10px;
          opacity: 0.6;
          line-height: 1.5;
        }
        @media (max-width: 600px) {
          .gfooter { font-size: 10.5px; padding: 14px 12px; }
        }
        @media print { .gfooter { display: none; } }
      `}</style>
    </footer>
  );
}
