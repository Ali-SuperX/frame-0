import type { ReactNode } from "react";

export function HelpSection({
  id,
  no,
  title,
  group,
  children,
}: {
  id: string;
  no: string;
  title: string;
  group: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="help2-section">
      <header className="help2-section-head">
        <span className="help2-section-no">{no}</span>
        <h2 className="help2-section-title">{title}</h2>
        <span className="help2-section-group">{group}</span>
      </header>
      {children}
    </section>
  );
}

/** h3 子标题带 anchor hover 链。子标题 id 用于深链。 */
export function H3({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id}>
      <a href={`#${id}`} className="help2-anchor" aria-label="链接到此节">#</a>
      {children}
    </h3>
  );
}
