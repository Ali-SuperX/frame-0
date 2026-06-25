"use client";

import { useEffect, useState } from "react";

export type TOCEntry = {
  group: string;
  items: { id: string; no: string; title: string }[];
};

export function HelpTOC({ entries }: { entries: TOCEntry[] }) {
  const [active, setActive] = useState<string>(entries[0]?.items[0]?.id ?? "");
  const [mobileOpen, setMobileOpen] = useState(false);

  // 滚动联动：监听各 section 进入视窗，最靠近顶部的视为 active。
  useEffect(() => {
    const ids = entries.flatMap((g) => g.items.map((it) => it.id));
    const elems = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (!elems.length) return;

    let visible = new Map<string, number>(); // id -> top
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            visible.set(e.target.id, e.boundingClientRect.top);
          } else {
            visible.delete(e.target.id);
          }
        }
        // 选 top 最接近 0 (但 ≥ 0 优先) 的为 active
        if (visible.size > 0) {
          let best: string | null = null;
          let bestTop = Infinity;
          for (const [id, top] of visible) {
            // 优先 top >= 0，否则取最大负值（最接近 0）
            const score = top >= 0 ? top : Math.abs(top) + 1e6;
            if (score < bestTop) { bestTop = score; best = id; }
          }
          if (best) setActive(best);
        }
      },
      { rootMargin: "-88px 0px -65% 0px", threshold: [0, 0.1] }
    );
    elems.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [entries]);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `#${id}`);
      setActive(id);
      setMobileOpen(false);
    }
  }

  const activeTitle =
    entries.flatMap((g) => g.items).find((it) => it.id === active)?.title ?? "目录";

  return (
    <aside className="help2-toc">
      <button
        type="button"
        className="help2-toc-mobile-toggle"
        onClick={() => setMobileOpen((v) => !v)}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? "✕ 关闭目录" : `≡ ${activeTitle}`}
      </button>
      <nav
        className={`help2-toc-content ${mobileOpen ? "open" : ""}`}
        aria-label="文档目录"
      >
        {entries.map((g) => (
          <div key={g.group} className="help2-toc-group">
            <div className="help2-toc-group-head">{g.group}</div>
            <ul className="help2-toc-list">
              {g.items.map((it) => (
                <li key={it.id}>
                  <a
                    href={`#${it.id}`}
                    className={`help2-toc-link ${active === it.id ? "active" : ""}`}
                    onClick={(e) => handleClick(e, it.id)}
                  >
                    <span className="help2-toc-link-no">{it.no}</span>
                    <span>{it.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
