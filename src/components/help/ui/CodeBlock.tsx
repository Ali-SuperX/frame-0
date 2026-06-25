import type { ReactNode } from "react";

/** 等宽代码块，无语法高亮（避免引入 prism/shiki 重型依赖）。
 *  适用 prompt 示例 / ASCII 工作流图 / 命令行指令。 */
export function CodeBlock({
  title,
  lang,
  children,
}: {
  title?: string;
  lang?: string;
  children: ReactNode;
}) {
  const hasBar = title || lang;
  return (
    <div className="help2-code">
      {hasBar && (
        <div className="help2-code-bar">
          {title && <span className="help2-code-title">{title}</span>}
          {lang && <span className="help2-code-lang">{lang}</span>}
        </div>
      )}
      <pre className="help2-code-pre">{children}</pre>
    </div>
  );
}
