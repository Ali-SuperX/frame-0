"use client";

/**
 * Frame/0 主战宣传页 (Landing).
 *
 * 设计原则:
 *  - 暗色 / serif italic 大字 / 终端式 mono kicker / 颗粒纹理 —— 跟产品一致
 *  - 不堆功能,讲价值:剧本即真相 · 一句话到一部剧 · 端到端
 *  - 不放虚假数据(用户数 / 评价),只放真实模块入口
 *  - 滚动微动效 (IntersectionObserver fade-in),Hero 自动呼吸
 *
 * 结构:
 *  1. Hero — kicker + 大标题 + 副标 + Create Video CTA + 演示 mockup
 *  2. Four Modules — 工坊 / 导演台 / 片场 / 剪辑 四张大卡
 *  3. Differentiators — 4 个差异化点
 *  4. Use Cases — 6 个适用场景 chip
 *  5. Final CTA — 大字收尾
 *  6. Footer — 简洁链接
 */

import Link from "next/link";
import { useLocale } from "next-intl";
import { useEffect, useRef } from "react";
import LocaleSwitcher from "./LocaleSwitcher";

export default function Landing() {
  const locale = useLocale();
  const zh = locale === "zh";

  // 路由 hrefs(全部 i18n-aware)
  const studioHref = zh ? "/studio" : "/en/studio";
  const canvasHref = zh ? "/canvas" : "/en/canvas";
  const directorHref = zh ? "/director" : "/en/director";
  const editorHref = zh ? "/editor" : "/en/editor";
  const guideHref = zh ? "/guide" : "/en/guide";
  const helpHref = zh ? "/help" : "/en/help";

  /* —— scroll-triggered reveal —— */
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const targets = root.querySelectorAll<HTMLElement>("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("revealed");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  return (
    <div className="landing" ref={rootRef}>
      {/* —— 顶部 chrome —— 简化版,只 logo + 入口 + 语言 + 进入应用 */}
      <header className="ld-chrome">
        <div className="ld-chrome-inner">
          <div className="ld-logo">
            Frame<span className="slash">/</span>0
          </div>
          <nav className="ld-nav">
            <a href="#modules">{zh ? "模块" : "Modules"}</a>
            <a href="#enterprise" className="hot">
              {zh ? "企业方案" : "Enterprise"}
            </a>
            <a href="#templates">{zh ? "模板" : "Templates"}</a>
            <a href="#why">{zh ? "为何不同" : "Why"}</a>
            <a href="#use">{zh ? "场景" : "Use cases"}</a>
            <Link prefetch={false} href={guideHref}>
              {zh ? "指南" : "Guide"}
            </Link>
          </nav>
          <div className="ld-chrome-right">
            <Link prefetch={false} href={studioHref} className="ld-chrome-cta">
              {zh ? "进入工坊 →" : "Open Studio →"}
            </Link>
            <LocaleSwitcher />
          </div>
        </div>
      </header>

      {/* ═══ HERO ═══ */}
      <section className="ld-hero">
        <div className="ld-hero-inner">
          <div className="ld-hero-left">
            <div className="ld-kicker" data-reveal>
              FRAME / 0 · {zh ? "企业级 · 私有化 AI 视频工作室" : "ENTERPRISE · SELF-HOSTED AI VIDEO STUDIO"}
            </div>
            <h1 className="ld-hero-title" data-reveal>
              {zh ? (
                <>
                  <span className="ti-1">故事</span>
                  <span className="ti-2">在此</span>
                  <span className="ti-3">成形</span>
                </>
              ) : (
                <>
                  <span className="ti-1">Where</span>
                  <span className="ti-2">stories</span>
                  <span className="ti-3">take shape</span>
                </>
              )}
            </h1>
            <p className="ld-hero-sub" data-reveal>
              {zh
                ? "私有化部署 · 个性化定制 · 对接你的私有大模型。从剧本到成片,数据从不离开你的服务器。"
                : "Self-hosted · Fully customizable · Plugs into your private LLM. Script to screen, your data never leaves your servers."}
            </p>
            <div className="ld-hero-cta-row" data-reveal>
              <Link prefetch={false} href={canvasHref} className="ld-cta-primary">
                <span className="ld-cta-text">
                  {zh ? "立即体验" : "Create Video"}
                </span>
                <span className="ld-cta-arrow">→</span>
              </Link>
              <a href="#enterprise" className="ld-cta-secondary highlight">
                {zh ? "申请私有化方案 ↗" : "Talk to enterprise ↗"}
              </a>
              <Link prefetch={false} href={studioHref} className="ld-cta-tertiary">
                {zh ? "或先试一帧" : "or try a frame"}
              </Link>
            </div>
            <div className="ld-hero-meta" data-reveal>
              <span className="ld-dot ld-dot-live" />
              {zh
                ? "100+ 行业模板 · Docker 部署 · 接百炼 / OpenAI / 自部署模型 · 源码交付"
                : "100+ industry templates · Docker deploy · Bailian / OpenAI / private LLM · Source delivered"}
            </div>
          </div>

          <div className="ld-hero-right" data-reveal>
            <HeroMockup zh={zh} />
          </div>
        </div>
        {/* 大画幅装饰 */}
        <div className="ld-hero-edge top" />
        <div className="ld-hero-edge bottom" />
      </section>

      {/* ═══ 品牌故事 / 宣言 ═══ */}
      <section className="ld-story">
        <div className="ld-story-inner">
          <div className="ld-story-kicker" data-reveal>
            {zh ? "宣言 · 我们为什么做 Frame/0" : "MANIFESTO · WHY FRAME/0"}
          </div>
          <h2 className="ld-story-headline" data-reveal>
            {zh ? (
              <>
                让想象，<em>显影</em>。
              </>
            ) : (
              <>
                Imagination, <em>developed</em>.
              </>
            )}
          </h2>
          <div className="ld-story-body" data-reveal>
            {zh ? (
              <>
                <p>
                  做一条 AI 视频，今天要在十几个工具之间来回搬运：这个生图、那个配音、另一个转视频。改一句旁白，十几个中间文件得手动重对一遍。更别说——你的剧本、你的素材，全跑在别人的服务器上。
                </p>
                <p>
                  我们想做的，不是又一个提示词盒子。是一间<strong>暗房</strong>。
                </p>
                <p>
                  你给意图、给节奏、给情绪；像素、镜头、连续性交给机器。从一句话到一部成片——底片，不出你自己的门。
                </p>
              </>
            ) : (
              <>
                <p>
                  Making one AI video today means shuttling between a dozen tools —
                  one for stills, one for voice, another for video. Tweak a single
                  line and you re-sync a dozen intermediate files by hand. And your
                  script, your footage? Living on someone else&apos;s servers.
                </p>
                <p>
                  We didn&apos;t want another prompt box. We wanted a{" "}
                  <strong>darkroom</strong>.
                </p>
                <p>
                  You bring intent, pacing, emotion; pixels, lensing and continuity
                  are the machine&apos;s job. From one line to a finished cut — the
                  negative never leaves your door.
                </p>
              </>
            )}
          </div>
          <div className="ld-story-slogan" data-reveal>
            {zh ? "你导演。我们显影。" : "You direct. We develop."}
          </div>
        </div>
      </section>

      {/* ═══ MODULES ═══ */}
      <section id="modules" className="ld-modules">
        <div className="ld-section-head" data-reveal>
          <div className="ld-section-kicker">
            {zh ? "五个工作模式" : "FIVE MODES OF WORK"}
          </div>
          <h2 className="ld-section-title">
            {zh ? "对话、生长、试镜、写剧、剪辑" : "Chat, grow, audition, write, edit"}
          </h2>
          <p className="ld-section-sub">
            {zh
              ? "每个模式专注一件事。你能从任意点切入,中途切换不丢工程。"
              : "Each mode does one thing well. Enter from any point, switch without losing your project."}
          </p>
        </div>

        <div className="ld-modules-grid">
          <ModuleCard
            data-reveal
            kicker={zh ? "工坊" : "STUDIO"}
            title={zh ? "对话生成单帧" : "Chat your first frame"}
            desc={
              zh
                ? "跟 AI 像聊天一样描述画面。文生图、图生图、参数微调,几秒一张。"
                : "Describe a frame in plain language. Text-to-image, image-edit, fine-tune — seconds per take."
            }
            tag={zh ? "千问 / 万相 / Z-Image" : "Qwen · Wan · Z-Image"}
            href={studioHref}
            cta={zh ? "进入工坊" : "Open Studio"}
            accent="accent"
            mockup="studio"
          />
          <ModuleCard
            data-reveal
            kicker={zh ? "画布" : "CANVAS"}
            title={zh ? "在画布上生长创作" : "Grow on an infinite canvas"}
            desc={
              zh
                ? "每个节点一次生成,从成片分支出延续 / 参考 / 变体,把灵感长成一棵树。节点内就能选导演套路、套提示库。"
                : "Each node is one generation; branch a result into continue / reference / variation and grow ideas into a tree. Director styles and prompt presets live right inside the node."
            }
            tag={zh ? "无限画布 · 多项目" : "Infinite canvas · multi-project"}
            href={canvasHref}
            cta={zh ? "进入画布" : "Open Canvas"}
            accent="accent"
            mockup="canvas"
          />
          <ModuleCard
            data-reveal
            kicker={zh ? "导演台" : "DIRECTOR"}
            title={zh ? "多路径试镜,挑最好那条" : "Cast different shots side-by-side"}
            desc={
              zh
                ? "导演台一次跑多个模型 / 多个提示词,对比择优。再用 R2V 把图变成 10 秒动态镜头。"
                : "Run multiple models / prompts in parallel, then convert the winner to a 10s motion shot via R2V."
            }
            tag={zh ? "Seedance / HappyHorse R2V" : "Seedance · HappyHorse R2V"}
            href={directorHref}
            cta={zh ? "进入导演台" : "Open Director"}
            accent="cyan"
            mockup="director"
          />
          <ModuleCard
            data-reveal
            kicker={zh ? "短漫剧" : "STAGE"}
            title={zh ? "一句话写一部剧" : "One line to a full episode"}
            desc={
              zh
                ? "AI 写剧本、出图、配音、转视频。漫剧 / 短剧同框,角色册跨拍一致。"
                : "AI writes the script, generates frames, synthesizes voiceover, converts to video. Comic & short-drama, one cast across shots."
            }
            tag={zh ? "Qwen3.6 + Qwen-Image-Edit + CosyVoice" : "Qwen 3.6 + Qwen-Image-Edit + CosyVoice"}
            href={canvasHref}
            cta={zh ? "进入短漫剧" : "Open Stage"}
            accent="teal"
            mockup="stage"
            featured
          />
          <ModuleCard
            data-reveal
            kicker={zh ? "剪辑" : "EDITOR"}
            title={zh ? "专业级 NLE 时间线" : "Pro-grade NLE timeline"}
            desc={
              zh
                ? "多轨剪辑,Blade 任意切,Ripple 删除,JKL 速度环,关键帧 PiP —— 对标 CapCut / DaVinci。"
                : "Multi-track timeline, Blade tool, Ripple delete, JKL shuttle, PiP keyframes — head-to-head with CapCut / DaVinci."
            }
            tag={zh ? "FFmpeg WASM · 1080p / 2K" : "FFmpeg WASM · 1080p / 2K"}
            href={editorHref}
            cta={zh ? "进入剪辑" : "Open Editor"}
            accent="signal"
            mockup="editor"
          />
        </div>
      </section>

      {/* ═══ ENTERPRISE ═══ */}
      <section id="enterprise" className="ld-enterprise">
        <div className="ld-section-head" data-reveal>
          <div className="ld-section-kicker">
            {zh ? "企业方案" : "ENTERPRISE"}
          </div>
          <h2 className="ld-section-title">
            {zh ? "私有化部署 + 个性化定制" : "Self-hosted, made yours"}
          </h2>
          <p className="ld-section-sub">
            {zh
              ? "把整套 AI 视频生产线交付到你的环境。数据不出本地,模型可换、UI 可改、流程可裁。"
              : "Ship the entire AI video pipeline into your environment. Data stays on-prem; models swap, UI rebrands, workflows tailor."}
          </p>
        </div>

        <div className="ld-ent-grid">
          <div className="ld-ent-card" data-reveal>
            <div className="ld-ent-icon-wrap">
              <svg className="ld-ent-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
            </div>
            <div className="ld-ent-num">01</div>
            <h3 className="ld-ent-title">
              {zh ? "私有化部署" : "Self-hosted"}
            </h3>
            <p className="ld-ent-desc">
              {zh
                ? "全栈代码交付,Docker / K8s 一键部署到你自己的服务器。模型权重、生成数据、视频素材全部本地存储,合规审计无负担。"
                : "Full source code delivered, one-shot Docker / K8s deploy to your own infra. Model weights, generation outputs, and video assets all stay local — audit-friendly from day one."}
            </p>
            <ul className="ld-ent-list">
              <li>{zh ? "Docker Compose / K8s Helm Chart" : "Docker Compose / K8s Helm Chart"}</li>
              <li>{zh ? "数据全本地,无外发流量(可控)" : "All data on-prem, no outbound (configurable)"}</li>
              <li>{zh ? "SSO / OAuth / LDAP 对接" : "SSO / OAuth / LDAP integration"}</li>
              <li>{zh ? "多租户隔离 · 审计日志 · 合规报表" : "Multi-tenant · Audit logs · Compliance reports"}</li>
            </ul>
          </div>

          <div className="ld-ent-card featured" data-reveal>
            <div className="ld-ent-icon-wrap">
              <svg className="ld-ent-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 4l-1.7 6.4L18 12l-6.3 1.6L14 20l-3-5.6L4 12l7-1.6L14 4z" />
              </svg>
            </div>
            <div className="ld-ent-num">02</div>
            <h3 className="ld-ent-title">
              {zh ? "个性化定制" : "Made yours"}
            </h3>
            <p className="ld-ent-desc">
              {zh
                ? "UI 配色、品牌 Logo、工作流模块、提示词模板、字幕样式、导出预设 —— 一切都能按需改造。源码交付,二次开发零门槛。"
                : "Theme, branding, workflow modules, prompt templates, caption styles, export presets — all customizable. Source delivered, zero friction to extend."
              }
            </p>
            <ul className="ld-ent-list">
              <li>{zh ? "品牌主题(色 / 字体 / Logo)替换" : "Brand theme (color / font / logo) swap"}</li>
              <li>{zh ? "工作流裁剪:只保留你要的模块" : "Workflow pruning — keep only what you need"}</li>
              <li>{zh ? "Prompt / 字幕 / 导出预设可配置" : "Prompts · captions · export presets configurable"}</li>
              <li>{zh ? "TypeScript / Next.js / React 标准技术栈" : "TypeScript / Next.js / React standard stack"}</li>
            </ul>
          </div>

          <div className="ld-ent-card" data-reveal>
            <div className="ld-ent-icon-wrap">
              <svg className="ld-ent-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3a14 14 0 010 18M3 12h18" />
                <path d="M12 3c-3 3-4.5 6-4.5 9s1.5 6 4.5 9c3-3 4.5-6 4.5-9s-1.5-6-4.5-9z" />
              </svg>
            </div>
            <div className="ld-ent-num">03</div>
            <h3 className="ld-ent-title">
              {zh ? "对接你的模型" : "Plug your models"}
            </h3>
            <p className="ld-ent-desc">
              {zh
                ? "内置百炼、千问、万相、HappyHorse,也支持任何 OpenAI 兼容协议。自部署 LLM、私有 imagegen、自训 LoRA —— 在 settings 里填个 URL 就接上。"
                : "Built-in Bailian, Qwen, Wan, HappyHorse — and any OpenAI-compatible endpoint. Self-hosted LLMs, private imagegen, custom LoRAs — point at a URL in settings, done."}
            </p>
            <ul className="ld-ent-list">
              <li>{zh ? "OpenAI / 百炼 / Anthropic / 字节火山" : "OpenAI / Bailian / Anthropic / Volcengine"}</li>
              <li>{zh ? "自部署 SDXL / Flux / ComfyUI 接入" : "Self-hosted SDXL / Flux / ComfyUI"}</li>
              <li>{zh ? "角色 LoRA / 风格 LoRA / 私有微调模型" : "Character / style LoRAs · private fine-tunes"}</li>
              <li>{zh ? "API key 在你的环境变量里,不出前端" : "API keys in your env vars, never reach the client"}</li>
            </ul>
          </div>
        </div>

        <div className="ld-ent-foot" data-reveal>
          <div className="ld-ent-foot-text">
            <strong>
              {zh ? "私有化交付 · 一对一咨询 · 三周内上线" : "On-prem delivery · 1-on-1 consultation · live in 3 weeks"}
            </strong>
            <span>
              {zh
                ? "媒体 / 电商 / 教育 / 政企 / 文旅 客户优先支持"
                : "Priority for media · e-commerce · education · gov / public sector · tourism"}
            </span>
          </div>
          <a href="mailto:enterprise@frame-0.app" className="ld-cta-primary">
            <span className="ld-cta-text">
              {zh ? "申请私有化方案" : "Talk to enterprise"}
            </span>
            <span className="ld-cta-arrow">→</span>
          </a>
        </div>
      </section>

      {/* ═══ WHY DIFFERENT ═══ */}
      <section id="why" className="ld-why">
        <div className="ld-section-head" data-reveal>
          <div className="ld-section-kicker">
            {zh ? "为何不同" : "WHY DIFFERENT"}
          </div>
          <h2 className="ld-section-title">
            {zh ? "工具串不出来的东西" : "What stitched-together tools can't do"}
          </h2>
        </div>

        <div className="ld-why-grid">
          <WhyCard
            data-reveal
            num="01"
            title={zh ? "数据全本地" : "Data stays local"}
            body={
              zh
                ? "Docker 一键部署到你的服务器。剧本、生成数据、视频素材都在你的硬盘上,合规审计零负担。可选完全断网模式。"
                : "Docker deploy onto your own infra. Scripts, generations, video assets — all on your disk, audit-friendly from day one. Optional air-gapped mode."
            }
          />
          <WhyCard
            data-reveal
            num="02"
            title={zh ? "对接私有大模型" : "Plug your private models"}
            body={
              zh
                ? "OpenAI 兼容协议,自部署 LLM / 私有 imagegen / 自训 LoRA 在 settings 里填个 URL 就接上。不锁单一厂商。"
                : "OpenAI-compatible protocol. Self-hosted LLMs, private imagegen, custom LoRAs — point at a URL in settings, done. No vendor lock-in."
            }
          />
          <WhyCard
            data-reveal
            num="03"
            title={zh ? "UI / 工作流可定制" : "UI & workflow yours to shape"}
            body={
              zh
                ? "源码交付,标准 Next.js + React 技术栈。换 logo、改色、裁剪模块、加新流程,内部研发能直接上手。"
                : "Source delivered, standard Next.js + React. Swap logo, theme, prune modules, add flows — your in-house team owns it after handoff."
            }
          />
          <WhyCard
            data-reveal
            num="04"
            title={zh ? "剧本即真相" : "Script as truth"}
            body={
              zh
                ? "改一句旁白,这一拍的图、音、视频全部一致重生。不再手动同步十几个工具之间的中间文件。"
                : "Change a line of narration — image, voice, video re-render in sync. No juggling stale exports across five SaaS."
            }
          />
          <WhyCard
            data-reveal
            num="05"
            title={zh ? "角色跨拍一致" : "One cast, every shot"}
            body={
              zh
                ? "角色册:头像 + 音色 + 描述。每张图自动注入参考,跨拍形象不漂移。多角色对白自动分音色。"
                : "Cast register: avatar + voice + description. Every gen auto-injects the reference; multi-speaker dialogue auto-routes per voice."
            }
          />
          <WhyCard
            data-reveal
            num="06"
            title={zh ? "端到端,不切窗口" : "One project, end to end"}
            body={
              zh
                ? "剧本 → 时间线 → 导出 MP4。中间不下载、不上传、不切工具。一份工程,从首句到成片。"
                : "Script → timeline → MP4. No downloads, no uploads, no app-switching. One project from first line to final cut."
            }
          />
        </div>
      </section>

      {/* ═══ USE CASES ═══ */}
      <section id="use" className="ld-uses">
        <div className="ld-section-head" data-reveal>
          <div className="ld-section-kicker">
            {zh ? "适用场景" : "USE CASES"}
          </div>
          <h2 className="ld-section-title">
            {zh ? "落地场景" : "Where Frame/0 ships"}
          </h2>
          <p className="ld-section-sub">
            {zh
              ? "企业内容生产 · 媒体团队 · 创作者工作流 —— 同一套系统按需裁剪"
              : "Enterprise content ops · media teams · creator workflows — one stack, tailored for each."}
          </p>
        </div>

        <div className="ld-uses-grid" data-reveal>
          {[
            { zh: "品牌广告投放", en: "Brand campaigns", icon: "◉" },
            { zh: "电商投流素材", en: "E-commerce ads", icon: "✦" },
            { zh: "产品演示视频", en: "Product demos", icon: "▣" },
            { zh: "员工培训课件", en: "Employee training", icon: "✎" },
            { zh: "内部宣传通告", en: "Internal comms", icon: "◇" },
            { zh: "客户案例剧情化", en: "Customer stories", icon: "⌘" },
            { zh: "AI 漫剧 / 短剧", en: "AI comic & short drama", icon: "▶" },
            { zh: "个人创作者", en: "Solo creators", icon: "✺" },
          ].map((u) => (
            <div key={u.en} className="ld-use-chip">
              <span className="ld-use-icon">{u.icon}</span>
              <span className="ld-use-label">{zh ? u.zh : u.en}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ TEMPLATES ═══ */}
      <section id="templates" className="ld-templates">
        <div className="ld-section-head" data-reveal>
          <div className="ld-section-kicker">
            {zh ? "模板库 · 100+ 行业脚本" : "TEMPLATES · 100+ INDUSTRY SCRIPTS"}
          </div>
          <h2 className="ld-section-title">
            {zh ? "开箱即用,品牌即出片" : "Open the box, brand on screen"}
          </h2>
          <p className="ld-section-sub">
            {zh
              ? "每个模板都是一套完整工程:剧本骨架 + 角色册 + 镜头语言 + 字幕样式 + BGM 节奏。私有化版本可按你的品牌定制专属模板。"
              : "Each template is a full project: script skeleton + cast register + camera language + caption style + BGM pacing. On-prem version comes with custom-tailored templates for your brand."}
          </p>
        </div>

        {/* 分类 chips */}
        <div className="ld-tpl-tabs" data-reveal>
          {[
            { zh: "全部 100+", en: "All 100+", count: "" },
            { zh: "营销广告", en: "Marketing", count: "28" },
            { zh: "电商投流", en: "E-commerce", count: "22" },
            { zh: "产品演示", en: "Product demo", count: "16" },
            { zh: "培训教育", en: "Training", count: "14" },
            { zh: "漫剧短剧", en: "Drama", count: "12" },
            { zh: "客户案例", en: "Case study", count: "8" },
          ].map((c, i) => (
            <button key={c.en} className={`ld-tpl-tab${i === 0 ? " on" : ""}`}>
              <span>{zh ? c.zh : c.en}</span>
              {c.count && <em>{c.count}</em>}
            </button>
          ))}
        </div>

        {/* 模板墙 —— 12 个示例,4×3 grid */}
        <div className="ld-tpl-grid">
          {TEMPLATES.map((t, i) => (
            <TemplateCard key={t.id} {...t} zh={zh} reveal />
          ))}
        </div>

        <div className="ld-tpl-foot" data-reveal>
          <div className="ld-tpl-foot-text">
            <strong>
              {zh ? "私有化版本:专属品牌模板按需定制" : "On-prem: branded templates tailored on demand"}
            </strong>
            <span>
              {zh
                ? "提供 5 套品牌定制模板 · 一年内不限次微调 · 你的同事也能直接编辑"
                : "5 brand-tailored templates included · unlimited fine-tunes for 1 yr · in-house editable"}
            </span>
          </div>
          <div className="ld-tpl-foot-cta">
            <a href="mailto:enterprise@frame-0.app" className="ld-cta-secondary highlight">
              {zh ? "申请定制模板 ↗" : "Request custom templates ↗"}
            </a>
            <Link prefetch={false} href={canvasHref} className="ld-cta-tertiary">
              {zh ? "或浏览公开模板" : "or browse public templates"}
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section className="ld-final">
        <div className="ld-final-inner" data-reveal>
          <h2 className="ld-final-title">
            {zh ? (
              <>
                你的 AI 视频生产线, <em>在你自己的服务器上</em>。
              </>
            ) : (
              <>
                Your AI video pipeline, <em>on your own servers</em>.
              </>
            )}
          </h2>
          <div className="ld-final-cta">
            <a href="mailto:enterprise@frame-0.app" className="ld-cta-primary big">
              <span className="ld-cta-text">
                {zh ? "申请私有化方案" : "Talk to enterprise"}
              </span>
              <span className="ld-cta-arrow">→</span>
            </a>
            <Link prefetch={false} href={canvasHref} className="ld-cta-secondary big">
              {zh ? "或先体验云端 ↗" : "or try the cloud demo ↗"}
            </Link>
          </div>
          <div className="ld-final-meta">
            {zh
              ? "私有化交付 · 一对一咨询 · 三周内上线 · 源码 + 一年维护"
              : "On-prem delivery · 1-on-1 consult · live in 3 weeks · source + 1yr support"}
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="ld-footer">
        <div className="ld-footer-inner">
          <div className="ld-footer-brand">
            <div className="ld-logo small">
              Frame<span className="slash">/</span>0
            </div>
            <p className="ld-footer-tag">
              {zh
                ? "Frame/0 · AI 视频工作室 · 剧本到成片"
                : "Frame/0 · AI video studio · script to screen"}
            </p>
          </div>
          <div className="ld-footer-cols">
            <FooterCol
              title={zh ? "企业方案" : "Enterprise"}
              links={[
                { href: "mailto:enterprise@frame-0.app", label: zh ? "申请私有化部署" : "Request on-prem demo", external: true },
                { href: "mailto:enterprise@frame-0.app", label: zh ? "个性化定制咨询" : "Customization consult", external: true },
                { href: "mailto:enterprise@frame-0.app", label: zh ? "联系销售" : "Contact sales", external: true },
              ]}
            />
            <FooterCol
              title={zh ? "模块" : "Modules"}
              links={[
                { href: studioHref, label: zh ? "工坊" : "Studio" },
                { href: canvasHref, label: zh ? "画布" : "Canvas" },
                { href: directorHref, label: zh ? "导演台" : "Director" },
                { href: editorHref, label: zh ? "剪辑" : "Editor" },
              ]}
            />
            <FooterCol
              title={zh ? "资源" : "Resources"}
              links={[
                { href: guideHref, label: zh ? "提示词指南" : "Prompt Guide" },
                { href: helpHref, label: zh ? "帮助" : "Help" },
              ]}
            />
          </div>
        </div>
        <div className="ld-footer-foot">
          <span>© {new Date().getFullYear()} Frame/0</span>
          <span className="ld-footer-foot-sep">·</span>
          <span>{zh ? "本地优先,自托管" : "Local-first, self-hosted"}</span>
        </div>
      </footer>

      <LandingStyles />
    </div>
  );
}

/* ─────────── Hero 演示 mockup —— 叠层 3 张窗口,模拟应用界面 ─────────── */
function HeroMockup({ zh }: { zh: boolean }) {
  return (
    <div className="ld-mockup">
      {/* 后景 —— 剪辑器 timeline */}
      <div className="mk mk-back">
        <div className="mk-bar">
          <span className="mk-dot r" />
          <span className="mk-dot y" />
          <span className="mk-dot g" />
          <span className="mk-bar-title">{zh ? "剪辑 · EP1" : "Editor · EP1"}</span>
        </div>
        <div className="mk-edit">
          <div className="mk-edit-preview" />
          <div className="mk-edit-tracks">
            <div className="mk-track">
              <span className="mk-track-head">V1</span>
              <span className="mk-clip mk-clip-1" />
              <span className="mk-clip mk-clip-2" />
              <span className="mk-clip mk-clip-3" />
            </div>
            <div className="mk-track">
              <span className="mk-track-head a">A1</span>
              <span className="mk-clip mk-clip-audio" />
            </div>
          </div>
        </div>
      </div>
      {/* 中景 —— 片场 beat 列表 */}
      <div className="mk mk-mid">
        <div className="mk-bar">
          <span className="mk-dot r" />
          <span className="mk-dot y" />
          <span className="mk-dot g" />
          <span className="mk-bar-title">{zh ? "片场 · 雨夜重逢" : "Stage · Rainy Reunion"}</span>
        </div>
        <div className="mk-beats">
          <div className="mk-beat on">
            <span className="mk-beat-idx">1</span>
            <span className="mk-beat-thumb t1" />
            <span className="mk-beat-text">{zh ? '"她在地铁站等了一年。"' : '"She waited a year at the station."'}</span>
          </div>
          <div className="mk-beat">
            <span className="mk-beat-idx">2</span>
            <span className="mk-beat-thumb t2" />
            <span className="mk-beat-text">{zh ? '"那一刻,她终于看见他。"' : '"And then, she saw him."'}</span>
          </div>
          <div className="mk-beat">
            <span className="mk-beat-idx">3</span>
            <span className="mk-beat-thumb t3" />
            <span className="mk-beat-text">{zh ? '"他撑着伞,慢慢走来。"' : '"He came over, umbrella in hand."'}</span>
          </div>
        </div>
      </div>
      {/* 前景 —— Studio chat */}
      <div className="mk mk-front">
        <div className="mk-bar">
          <span className="mk-dot r" />
          <span className="mk-dot y" />
          <span className="mk-dot g" />
          <span className="mk-bar-title">{zh ? "工坊 · 对话" : "Studio · Chat"}</span>
        </div>
        <div className="mk-chat">
          <div className="mk-msg user">{zh ? "雨夜地铁站,女孩撑伞回头" : "Rainy station, girl turns under umbrella"}</div>
          <div className="mk-msg ai">
            <span className="mk-thumb thumb-out" />
            <span className="mk-msg-text">{zh ? "生成中..." : "Generating..."}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Module Card ─────────── */
function ModuleCard({
  kicker,
  title,
  desc,
  tag,
  href,
  cta,
  accent,
  mockup,
  featured,
  ...rest
}: {
  kicker: string;
  title: string;
  desc: string;
  tag: string;
  href: string;
  cta: string;
  accent: "accent" | "cyan" | "teal" | "signal";
  mockup: "studio" | "canvas" | "director" | "stage" | "editor";
  featured?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`ld-mod${featured ? " featured" : ""}`}
      data-accent={accent}
      {...rest}
    >
      <div className="ld-mod-mock">
        <ModuleMockup kind={mockup} />
      </div>
      <div className="ld-mod-body">
        <div className="ld-mod-kicker">{kicker}</div>
        <h3 className="ld-mod-title">{title}</h3>
        <p className="ld-mod-desc">{desc}</p>
        <div className="ld-mod-tag">{tag}</div>
        <Link prefetch={false} href={href} className="ld-mod-cta">
          {cta} <span className="arrow">→</span>
        </Link>
      </div>
    </div>
  );
}

/* —— 4 个模块的迷你 mockup,纯 CSS 画 —— */
function ModuleMockup({ kind }: { kind: "studio" | "canvas" | "director" | "stage" | "editor" }) {
  if (kind === "studio") {
    return (
      <div className="mod-mock studio">
        <div className="mod-chat">
          <div className="mod-msg">prompt: a girl turning under...</div>
          <div className="mod-grid">
            <span /><span className="on" /><span /><span />
          </div>
        </div>
      </div>
    );
  }
  if (kind === "canvas") {
    return (
      <div className="mod-mock canvas">
        <span className="mm-node n1" />
        <span className="mm-edge" />
        <span className="mm-node n2 on" />
        <span className="mm-plus">＋</span>
      </div>
    );
  }
  if (kind === "director") {
    return (
      <div className="mod-mock director">
        <div className="mod-compare">
          <div className="mod-comp-cell on" />
          <div className="mod-comp-cell" />
          <div className="mod-comp-cell" />
          <div className="mod-comp-cell" />
        </div>
      </div>
    );
  }
  if (kind === "stage") {
    return (
      <div className="mod-mock stage">
        <div className="mod-script">
          <div className="mod-beat-row sel">
            <span className="b-idx">1</span>
            <span className="b-thumb" />
            <span className="b-text">"她在地铁站..."</span>
          </div>
          <div className="mod-beat-row">
            <span className="b-idx">2</span>
            <span className="b-thumb t2" />
            <span className="b-text">"那一刻..."</span>
          </div>
          <div className="mod-beat-row">
            <span className="b-idx">3</span>
            <span className="b-thumb t3" />
            <span className="b-text">"他撑着伞..."</span>
          </div>
        </div>
      </div>
    );
  }
  // editor
  return (
    <div className="mod-mock editor">
      <div className="mod-preview" />
      <div className="mod-timeline">
        <span className="mod-clip c1" />
        <span className="mod-clip c2" />
        <span className="mod-clip c3" />
      </div>
      <div className="mod-timeline audio">
        <span className="mod-clip wave" />
      </div>
    </div>
  );
}

/* ─────────── Why card ─────────── */
function WhyCard({
  num,
  title,
  body,
  ...rest
}: { num: string; title: string; body: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="ld-why-card" {...rest}>
      <div className="ld-why-num">{num}</div>
      <h3 className="ld-why-title">{title}</h3>
      <p className="ld-why-body">{body}</p>
    </div>
  );
}

/* ─────────── 模板数据 + 卡片组件 ─────────── */

type Template = {
  id: string;
  zhName: string;
  enName: string;
  zhTag: string;
  enTag: string;
  category: string;
  duration: string; // e.g. "30s" / "60s"
  aspect: "9:16" | "16:9" | "1:1";
  shots: number;
  theme: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
};

const TEMPLATES: Template[] = [
  {
    id: "tvc-30s",
    zhName: "黄金 30 秒电视广告",
    enName: "30s TV Spot",
    zhTag: "营销 · 高密度信息",
    enTag: "Marketing · high density",
    category: "marketing",
    duration: "30s",
    aspect: "16:9",
    shots: 8,
    theme: 1,
  },
  {
    id: "tiktok-twist",
    zhName: "TikTok 竖版反转剧",
    enName: "TikTok Twist Reel",
    zhTag: "营销 · 强反转",
    enTag: "Marketing · strong twist",
    category: "marketing",
    duration: "45s",
    aspect: "9:16",
    shots: 6,
    theme: 2,
  },
  {
    id: "launch-teaser",
    zhName: "新品发布会预告",
    enName: "Product Launch Teaser",
    zhTag: "营销 · 神秘感",
    enTag: "Marketing · mystery",
    category: "marketing",
    duration: "60s",
    aspect: "16:9",
    shots: 10,
    theme: 3,
  },
  {
    id: "apparel-9grid",
    zhName: "服装上身 9 宫格",
    enName: "Apparel 9-Grid Reel",
    zhTag: "电商 · 多 SKU",
    enTag: "E-commerce · multi-SKU",
    category: "ecommerce",
    duration: "30s",
    aspect: "1:1",
    shots: 9,
    theme: 4,
  },
  {
    id: "food-asmr",
    zhName: "美食 ASMR 短视频",
    enName: "Food ASMR Short",
    zhTag: "电商 · 食欲特写",
    enTag: "E-commerce · close-up",
    category: "ecommerce",
    duration: "20s",
    aspect: "9:16",
    shots: 5,
    theme: 5,
  },
  {
    id: "beauty-pip",
    zhName: "美妆教程 PIP",
    enName: "Beauty Tutorial PIP",
    zhTag: "电商 · 双画面",
    enTag: "E-commerce · split frame",
    category: "ecommerce",
    duration: "60s",
    aspect: "9:16",
    shots: 8,
    theme: 6,
  },
  {
    id: "saas-demo",
    zhName: "SaaS 功能演示 90 秒",
    enName: "SaaS Feature Walk",
    zhTag: "产品 · 屏幕录制",
    enTag: "Product · screencap",
    category: "product",
    duration: "90s",
    aspect: "16:9",
    shots: 12,
    theme: 7,
  },
  {
    id: "unboxing",
    zhName: "硬件开箱测评",
    enName: "Unboxing Review",
    zhTag: "产品 · 真实感",
    enTag: "Product · authentic",
    category: "product",
    duration: "60s",
    aspect: "16:9",
    shots: 9,
    theme: 8,
  },
  {
    id: "training-safety",
    zhName: "员工安全培训剧",
    enName: "Safety Training Drama",
    zhTag: "培训 · 情境化",
    enTag: "Training · scenario",
    category: "training",
    duration: "120s",
    aspect: "16:9",
    shots: 14,
    theme: 1,
  },
  {
    id: "explainer-knowledge",
    zhName: "知识点动画讲解",
    enName: "Knowledge Explainer",
    zhTag: "培训 · 旁白驱动",
    enTag: "Training · narration",
    category: "training",
    duration: "90s",
    aspect: "16:9",
    shots: 11,
    theme: 3,
  },
  {
    id: "drama-ceo",
    zhName: "霸总误会三连",
    enName: "CEO Drama Trilogy",
    zhTag: "短剧 · 高传播",
    enTag: "Drama · viral",
    category: "drama",
    duration: "60s × 3",
    aspect: "9:16",
    shots: 18,
    theme: 5,
  },
  {
    id: "drama-period",
    zhName: "穿越古风感情线",
    enName: "Period Romance",
    zhTag: "漫剧 · 角色册",
    enTag: "Comic · with cast",
    category: "drama",
    duration: "90s",
    aspect: "9:16",
    shots: 12,
    theme: 4,
  },
];

function TemplateCard({
  id,
  zhName,
  enName,
  zhTag,
  enTag,
  duration,
  aspect,
  shots,
  theme,
  zh,
  reveal,
}: Template & { zh: boolean; reveal?: boolean }) {
  return (
    <div className="ld-tpl-card" data-theme={theme} {...(reveal ? { "data-reveal": "" } : {})}>
      <div className="ld-tpl-thumb">
        <TemplateThumbMockup aspect={aspect} theme={theme} id={id} />
        <div className="ld-tpl-aspect">{aspect}</div>
      </div>
      <div className="ld-tpl-body">
        <h4 className="ld-tpl-name">{zh ? zhName : enName}</h4>
        <div className="ld-tpl-tag">{zh ? zhTag : enTag}</div>
        <div className="ld-tpl-meta">
          <span className="ld-tpl-meta-item">⏱ {duration}</span>
          <span className="ld-tpl-meta-sep">·</span>
          <span className="ld-tpl-meta-item">▦ {shots} {zh ? "拍" : "shots"}</span>
        </div>
      </div>
    </div>
  );
}

/** 纯 CSS 模板缩略图 —— 每个 id 一个微差异(避免 12 张完全一样) */
function TemplateThumbMockup({ aspect, theme, id }: { aspect: string; theme: number; id: string }) {
  const aspectStyle =
    aspect === "9:16" ? { aspectRatio: "9/16" } :
    aspect === "1:1" ? { aspectRatio: "1/1" } :
    { aspectRatio: "16/9" };

  // 基于 id 字符串产生稳定的"偏移"种子,让每个 thumb 略不同
  const seed = id.charCodeAt(0) + id.charCodeAt(id.length - 1);
  const variant = seed % 4;

  return (
    <div className="ld-tpl-stage" style={aspectStyle}>
      {/* 大色块 + 渐变 */}
      <div className={`ld-tpl-bg variant-${variant}`} />
      {/* 主体形状 —— 圆 / 三角 / 矩形 / 多边形 */}
      <div className={`ld-tpl-shape shape-${variant}`} />
      {/* 模拟字幕条 */}
      <div className="ld-tpl-cap">
        <span className="ld-tpl-cap-bar" />
        <span className="ld-tpl-cap-bar short" />
      </div>
      {/* 模拟时间码 / 角标 */}
      <div className="ld-tpl-corner">{aspect}</div>
    </div>
  );
}

/* ─────────── Footer column ─────────── */
function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string; external?: boolean }[];
}) {
  return (
    <div className="ld-fcol">
      <div className="ld-fcol-title">{title}</div>
      <ul>
        {links.map((l) => (
          <li key={l.href + l.label}>
            {l.external ? (
              <a href={l.href} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            ) : (
              <Link prefetch={false} href={l.href}>
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────── 全部样式 ─────────── */
function LandingStyles() {
  return (
    <style jsx global>{`
      .landing {
        background: var(--ink);
        color: var(--paper);
        min-height: 100vh;
        overflow-x: hidden;
      }
      [data-reveal] {
        opacity: 0;
        transform: translateY(18px);
        transition:
          opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
          transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
      }
      [data-reveal].revealed {
        opacity: 1;
        transform: translateY(0);
      }

      /* ——— 顶部 chrome ——— */
      .ld-chrome {
        position: sticky;
        top: 0;
        z-index: 50;
        background: color-mix(in oklab, var(--ink) 88%, transparent);
        backdrop-filter: blur(16px) saturate(140%);
        -webkit-backdrop-filter: blur(16px) saturate(140%);
        border-bottom: 1px solid color-mix(in oklab, var(--paper) 6%, transparent);
      }
      .ld-chrome-inner {
        max-width: 1280px;
        margin: 0 auto;
        padding: 14px 32px;
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 32px;
      }
      .ld-logo {
        font-family: var(--font-sans);
        font-weight: 700;
        font-size: 18px;
        letter-spacing: 0.02em;
        color: var(--paper);
      }
      .ld-logo .slash {
        color: var(--accent);
        margin: 0 1px;
      }
      .ld-logo.small {
        font-size: 16px;
      }
      .ld-nav {
        display: flex;
        gap: 28px;
        justify-content: center;
      }
      .ld-nav a {
        font-family: var(--font-mono);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.08em;
        color: var(--paper-mute);
        text-decoration: none;
        transition: color 0.15s;
        text-transform: uppercase;
      }
      .ld-nav a:hover { color: var(--paper); }
      .ld-chrome-right {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .ld-chrome-cta {
        background: var(--gradient-cta);
        color: var(--cta-ink);
        text-decoration: none;
        padding: 8px 18px;
        border-radius: var(--radius-md);
        font-family: var(--font-mono);
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: 0.06em;
        box-shadow: var(--shadow-cta);
        transition: all var(--ease-spring);
      }
      .ld-chrome-cta:hover {
        transform: translateY(-1px);
        box-shadow: var(--shadow-cta-hover);
        filter: brightness(1.06);
      }

      /* ═══ HERO ═══ */
      .ld-hero {
        position: relative;
        padding: 80px 32px 120px;
        max-width: 1280px;
        margin: 0 auto;
        overflow: hidden;
      }
      .ld-hero-inner {
        display: grid;
        grid-template-columns: 1.1fr 1fr;
        gap: 64px;
        align-items: center;
        min-height: 540px;
      }
      .ld-hero-edge {
        position: absolute;
        left: 50%; transform: translateX(-50%);
        width: 80vw; max-width: 1100px;
        height: 1px;
        background: linear-gradient(
          90deg,
          transparent 0%,
          color-mix(in oklab, var(--accent) 50%, transparent) 50%,
          transparent 100%
        );
        pointer-events: none;
      }
      .ld-hero-edge.top { top: 0; opacity: 0.4; }
      .ld-hero-edge.bottom { bottom: 0; opacity: 0.6; }

      .ld-kicker {
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.24em;
        color: var(--accent);
        margin-bottom: 28px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .ld-kicker::before {
        content: "";
        display: inline-block;
        width: 24px;
        height: 1px;
        background: var(--accent);
      }

      .ld-hero-title {
        font-family: var(--font-serif);
        font-style: italic;
        font-weight: 400;
        font-size: clamp(48px, 7.5vw, 96px);
        line-height: 0.98;
        letter-spacing: -0.02em;
        color: var(--paper);
        margin: 0 0 32px;
        display: flex;
        flex-direction: column;
      }
      .ld-hero-title span {
        display: block;
      }
      .ld-hero-title .ti-2 {
        color: color-mix(in oklab, var(--paper) 75%, var(--accent));
        padding-left: 0.8em;
      }
      .ld-hero-title .ti-3 {
        color: var(--accent);
        padding-left: 1.6em;
        position: relative;
      }
      .ld-hero-title .ti-3::after {
        content: "";
        position: absolute;
        right: 0;
        bottom: 8%;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--accent);
        animation: ld-pulse 2.4s ease-in-out infinite;
        box-shadow:
          0 0 0 0 color-mix(in oklab, var(--accent) 50%, transparent),
          0 0 24px color-mix(in oklab, var(--accent) 60%, transparent);
      }
      @keyframes ld-pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.2); opacity: 0.8; }
      }

      .ld-hero-sub {
        font-family: var(--font-serif);
        font-size: clamp(17px, 1.4vw, 21px);
        line-height: 1.55;
        color: var(--paper-dim);
        margin: 0 0 40px;
        max-width: 540px;
      }
      .ld-hero-cta-row {
        display: flex;
        gap: 14px;
        align-items: center;
        margin-bottom: 32px;
        flex-wrap: wrap;
      }
      .ld-cta-primary {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        background: var(--gradient-cta);
        color: var(--cta-ink);
        text-decoration: none;
        padding: 14px 28px;
        border-radius: var(--radius-md);
        font-family: var(--font-sans);
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.01em;
        box-shadow: var(--shadow-cta);
        transition: all var(--ease-spring);
        position: relative;
        overflow: hidden;
      }
      .ld-cta-primary.big {
        padding: 18px 38px;
        font-size: 17px;
      }
      .ld-cta-primary::before {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(
          120deg,
          transparent 35%,
          rgba(255,255,255,0.35) 50%,
          transparent 65%
        );
        transform: translateX(-100%);
        transition: transform 0.6s ease;
      }
      .ld-cta-primary:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-cta-hover);
        filter: brightness(1.06);
      }
      .ld-cta-primary:hover::before {
        transform: translateX(100%);
      }
      .ld-cta-arrow {
        font-family: var(--font-mono);
        font-weight: 700;
        transition: transform 0.25s var(--ease-spring);
      }
      .ld-cta-primary:hover .ld-cta-arrow {
        transform: translateX(4px);
      }

      .ld-cta-secondary {
        font-family: var(--font-mono);
        font-size: 12.5px;
        font-weight: 700;
        letter-spacing: 0.06em;
        color: var(--paper-dim);
        text-decoration: none;
        padding: 12px 20px;
        border: 1px solid color-mix(in oklab, var(--paper) 16%, var(--line));
        border-radius: var(--radius-md);
        transition: all var(--ease-quick);
      }
      .ld-cta-secondary.big {
        padding: 16px 28px;
        font-size: 13.5px;
      }
      .ld-cta-secondary:hover {
        color: var(--paper);
        border-color: color-mix(in oklab, var(--paper) 30%, var(--line));
        background: color-mix(in oklab, var(--paper) 4%, transparent);
        transform: translateY(-1px);
      }

      .ld-hero-meta {
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.06em;
        color: var(--paper-mute);
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .ld-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--paper-mute);
      }
      .ld-dot-live {
        background: var(--signal);
        box-shadow: 0 0 12px var(--signal);
        animation: ld-pulse 2s ease-in-out infinite;
      }

      /* ——— Hero mockup ——— */
      .ld-hero-right {
        position: relative;
        height: 100%;
        min-height: 480px;
      }
      .ld-mockup {
        position: relative;
        width: 100%;
        height: 480px;
      }
      .mk {
        position: absolute;
        background: var(--ink-2);
        border: 1px solid color-mix(in oklab, var(--paper) 8%, var(--line));
        border-radius: var(--radius-lg);
        box-shadow:
          0 16px 48px rgba(0,0,0,0.55),
          0 2px 6px rgba(0,0,0,0.3),
          inset 0 1px 0 rgba(255,255,255,0.04);
        overflow: hidden;
        transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .mk-back {
        top: 0; right: 5%;
        width: 88%; height: 65%;
        transform: rotate(2.5deg);
      }
      .mk-mid {
        top: 18%; right: 0;
        width: 70%; height: 60%;
        transform: rotate(-1.5deg);
        z-index: 2;
      }
      .mk-front {
        bottom: 0; left: 0;
        width: 64%; height: 56%;
        transform: rotate(1deg);
        z-index: 3;
      }
      .ld-hero-right:hover .mk-back { transform: rotate(4deg) translateY(-4px); }
      .ld-hero-right:hover .mk-mid { transform: rotate(-3deg) translateY(-2px); }
      .ld-hero-right:hover .mk-front { transform: rotate(2deg) translateY(4px); }

      .mk-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 14px;
        background: color-mix(in oklab, var(--ink) 60%, var(--ink-2));
        border-bottom: 1px solid var(--line);
      }
      .mk-dot {
        width: 8px; height: 8px;
        border-radius: 50%;
        background: var(--paper-mute);
      }
      .mk-dot.r { background: #ff5f57; }
      .mk-dot.y { background: #febc2e; }
      .mk-dot.g { background: #28c840; }
      .mk-bar-title {
        margin-left: 10px;
        font-family: var(--font-mono);
        font-size: 10.5px;
        font-weight: 600;
        letter-spacing: 0.08em;
        color: var(--paper-dim);
      }

      /* mk-back: 剪辑器 */
      .mk-edit {
        padding: 12px;
        display: grid;
        grid-template-rows: 1fr auto;
        gap: 10px;
        height: calc(100% - 38px);
      }
      .mk-edit-preview {
        background:
          radial-gradient(at 30% 40%, color-mix(in oklab, var(--accent) 30%, transparent), transparent 60%),
          linear-gradient(135deg, #1a1f2e 0%, #2a1810 100%);
        border-radius: var(--radius-md);
        height: 60%;
      }
      .mk-edit-tracks {
        display: flex; flex-direction: column; gap: 4px;
      }
      .mk-track {
        display: grid;
        grid-template-columns: 26px 1fr;
        gap: 4px;
        align-items: center;
      }
      .mk-track-head {
        font-family: var(--font-mono);
        font-size: 9px;
        font-weight: 700;
        color: var(--paper-mute);
        text-align: center;
      }
      .mk-track-head.a { color: #4ea8f7; }
      .mk-clip {
        height: 18px;
        background: linear-gradient(180deg, var(--ink-3), var(--ink-2));
        border: 1px solid color-mix(in oklab, var(--accent) 30%, var(--line));
        border-radius: 3px;
        display: inline-block;
        position: relative;
      }
      .mk-clip + .mk-clip { margin-left: 2px; }
      .mk-clip-1 { width: 24%; background: linear-gradient(135deg, color-mix(in oklab, var(--accent) 35%, var(--ink-3)), var(--ink-3)); }
      .mk-clip-2 { width: 30%; background: linear-gradient(135deg, color-mix(in oklab, var(--accent) 25%, var(--ink-3)), var(--ink-3)); }
      .mk-clip-3 { width: 42%; background: linear-gradient(135deg, color-mix(in oklab, var(--accent) 40%, var(--ink-3)), var(--ink-3)); }
      .mk-clip-audio {
        width: 100%;
        background: repeating-linear-gradient(
          90deg,
          #4ea8f7 0 2px,
          color-mix(in oklab, #4ea8f7 20%, var(--ink-2)) 2px 4px
        );
        border-color: color-mix(in oklab, #4ea8f7 30%, var(--line));
      }

      /* mk-mid: 片场 beats */
      .mk-beats {
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        height: calc(100% - 38px);
      }
      .mk-beat {
        display: grid;
        grid-template-columns: 18px 36px 1fr;
        gap: 8px;
        align-items: center;
        padding: 6px 8px;
        background: color-mix(in oklab, var(--ink-3) 60%, transparent);
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        font-family: var(--font-serif);
        font-style: italic;
        font-size: 11px;
        color: var(--paper-dim);
      }
      .mk-beat.on {
        border-color: var(--accent);
        background: color-mix(in oklab, var(--accent) 8%, var(--ink-3));
      }
      .mk-beat-idx {
        font-family: var(--font-mono);
        font-style: normal;
        font-size: 10px;
        font-weight: 700;
        color: var(--paper-mute);
        text-align: center;
      }
      .mk-beat.on .mk-beat-idx { color: var(--accent); }
      .mk-beat-thumb {
        width: 36px; height: 22px;
        border-radius: 2px;
      }
      .mk-beat-thumb.t1 {
        background: linear-gradient(135deg, #2a1810 0%, color-mix(in oklab, var(--accent) 60%, #2a1810) 100%);
      }
      .mk-beat-thumb.t2 {
        background: linear-gradient(135deg, #1a2030 0%, color-mix(in oklab, #4ea8f7 50%, #1a2030) 100%);
      }
      .mk-beat-thumb.t3 {
        background: linear-gradient(135deg, #0f2622 0%, color-mix(in oklab, #2dd4bf 50%, #0f2622) 100%);
      }
      .mk-beat-text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* mk-front: Studio chat */
      .mk-chat {
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        height: calc(100% - 38px);
        justify-content: flex-end;
      }
      .mk-msg {
        max-width: 85%;
        padding: 8px 12px;
        border-radius: var(--radius-md);
        font-family: var(--font-serif);
        font-style: italic;
        font-size: 12px;
        line-height: 1.5;
      }
      .mk-msg.user {
        align-self: flex-end;
        background: var(--gradient-cta);
        color: var(--cta-ink);
        font-style: normal;
        font-family: var(--font-sans);
        font-weight: 500;
      }
      .mk-msg.ai {
        align-self: flex-start;
        background: color-mix(in oklab, var(--ink-3) 70%, transparent);
        border: 1px solid var(--line);
        color: var(--paper-dim);
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .mk-thumb {
        width: 40px; height: 40px;
        border-radius: 4px;
        background:
          radial-gradient(at 30% 30%, color-mix(in oklab, var(--accent) 60%, transparent), transparent 70%),
          linear-gradient(135deg, #2a1810, #4a2818);
        flex-shrink: 0;
        animation: ld-thumb-pulse 2.4s ease-in-out infinite;
      }
      @keyframes ld-thumb-pulse {
        0%, 100% { filter: brightness(1); }
        50% { filter: brightness(1.3); }
      }
      .mk-msg-text {
        font-family: var(--font-mono);
        font-style: normal;
        font-size: 11px;
        color: var(--paper-mute);
      }

      /* ═══ MODULES ═══ */
      .ld-modules, .ld-why, .ld-uses, .ld-final {
        padding: 100px 32px;
        max-width: 1280px;
        margin: 0 auto;
      }
      .ld-section-head {
        text-align: center;
        margin-bottom: 64px;
        max-width: 680px;
        margin-left: auto;
        margin-right: auto;
      }
      .ld-section-kicker {
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.2em;
        color: var(--accent);
        margin-bottom: 16px;
      }
      .ld-section-title {
        font-family: var(--font-serif);
        font-style: italic;
        font-weight: 400;
        font-size: clamp(32px, 4vw, 52px);
        line-height: 1.1;
        letter-spacing: -0.015em;
        color: var(--paper);
        margin: 0 0 18px;
      }
      .ld-section-sub {
        font-family: var(--font-sans);
        font-size: 16px;
        line-height: 1.6;
        color: var(--paper-dim);
        margin: 0;
      }

      /* ═══ 品牌故事 / 宣言 —— 暗房暖光下的一段安静自白 ═══ */
      .ld-story {
        position: relative;
        padding: 132px 32px;
        max-width: 920px;
        margin: 0 auto;
        text-align: center;
      }
      .ld-story::before {
        content: "";
        position: absolute;
        inset: -10% -20%;
        background: radial-gradient(
          ellipse 56% 48% at 50% 38%,
          color-mix(in oklab, var(--accent) 10%, transparent),
          transparent 70%
        );
        pointer-events: none;
      }
      .ld-story-inner {
        position: relative;
      }
      .ld-story-kicker {
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.2em;
        color: var(--accent);
        margin-bottom: 22px;
      }
      .ld-story-headline {
        font-family: var(--font-serif);
        font-style: italic;
        font-weight: 400;
        font-size: clamp(46px, 6.5vw, 88px);
        line-height: 1.08;
        letter-spacing: -0.025em;
        color: var(--paper);
        margin: 0 0 44px;
      }
      .ld-story-headline em {
        color: var(--accent);
        font-style: italic;
      }
      .ld-story-body {
        max-width: 600px;
        margin: 0 auto 40px;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .ld-story-body p {
        font-family: var(--font-sans);
        font-size: 16.5px;
        line-height: 1.78;
        color: var(--paper-dim);
        margin: 0;
      }
      .ld-story-body strong {
        color: var(--paper);
        font-weight: 600;
      }
      .ld-story-slogan {
        font-family: var(--font-serif);
        font-style: italic;
        font-size: clamp(22px, 2.6vw, 32px);
        letter-spacing: 0.01em;
        color: var(--accent);
      }

      .ld-modules-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 24px;
      }
      .ld-mod {
        background: linear-gradient(180deg,
          color-mix(in oklab, var(--ink-2) 85%, transparent) 0%,
          color-mix(in oklab, var(--ink) 92%, transparent) 100%);
        border: 1px solid color-mix(in oklab, var(--paper) 6%, var(--line));
        border-radius: var(--radius-xl);
        overflow: hidden;
        display: grid;
        grid-template-rows: 200px 1fr;
        transition: all var(--ease-spring);
        position: relative;
      }
      .ld-mod::before {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg,
          var(--mod-accent-color) 0%,
          transparent 50%);
        opacity: 0.04;
        pointer-events: none;
      }
      .ld-mod[data-accent="accent"] { --mod-accent-color: oklch(0.72 0.17 40); }
      .ld-mod[data-accent="cyan"]   { --mod-accent-color: #4ea8f7; }
      .ld-mod[data-accent="teal"] { --mod-accent-color: #2dd4bf; }
      .ld-mod[data-accent="signal"] { --mod-accent-color: oklch(0.85 0.18 130); }
      .ld-mod.featured {
        grid-column: 1 / -1;
        grid-template-rows: 280px 1fr;
        background: linear-gradient(135deg,
          color-mix(in oklab, var(--ink-2) 80%, transparent) 0%,
          color-mix(in oklab, var(--mod-accent-color) 4%, var(--ink)) 100%);
      }
      .ld-mod:hover {
        transform: translateY(-4px);
        border-color: color-mix(in oklab, var(--mod-accent-color) 40%, var(--line));
        box-shadow:
          0 24px 48px rgba(0,0,0,0.4),
          0 0 0 1px color-mix(in oklab, var(--mod-accent-color) 25%, transparent);
      }

      .ld-mod-mock {
        background: var(--ink);
        border-bottom: 1px solid var(--line);
        position: relative;
        overflow: hidden;
      }
      .ld-mod-body {
        padding: 28px 32px 32px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .ld-mod-kicker {
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.2em;
        color: var(--mod-accent-color);
      }
      .ld-mod-title {
        font-family: var(--font-serif);
        font-style: italic;
        font-weight: 400;
        font-size: 28px;
        line-height: 1.15;
        color: var(--paper);
        margin: 0;
        letter-spacing: -0.01em;
      }
      .ld-mod.featured .ld-mod-title {
        font-size: 36px;
      }
      .ld-mod-desc {
        font-family: var(--font-sans);
        font-size: 14.5px;
        line-height: 1.65;
        color: var(--paper-dim);
        margin: 0;
      }
      .ld-mod-tag {
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.06em;
        color: var(--paper-mute);
        padding: 4px 10px;
        background: color-mix(in oklab, var(--mod-accent-color) 8%, transparent);
        border: 1px solid color-mix(in oklab, var(--mod-accent-color) 25%, var(--line));
        border-radius: 999px;
        align-self: flex-start;
        margin-top: 4px;
      }
      .ld-mod-cta {
        margin-top: auto;
        padding-top: 10px;
        font-family: var(--font-mono);
        font-size: 12.5px;
        font-weight: 700;
        letter-spacing: 0.06em;
        color: var(--mod-accent-color);
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        align-self: flex-start;
        transition: gap 0.25s var(--ease-spring);
      }
      .ld-mod-cta:hover { gap: 14px; }
      .ld-mod-cta .arrow {
        transition: transform 0.25s var(--ease-spring);
      }
      .ld-mod-cta:hover .arrow { transform: translateX(2px); }

      /* —— Module mini mockups —— */
      .mod-mock {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      /* Canvas —— 两个节点 + 连线 + ＋ */
      .mod-mock.canvas {
        display: block;
        padding: 0;
      }
      .mod-mock.canvas .mm-node {
        position: absolute;
        width: 88px;
        height: 60px;
        border-radius: 10px;
        background: color-mix(in oklab, #181109 78%, transparent);
        border: 1px solid var(--edge, rgba(255, 255, 255, 0.12));
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
      }
      .mod-mock.canvas .mm-node.n1 {
        left: 20%;
        top: 28%;
      }
      .mod-mock.canvas .mm-node.n2 {
        left: 50%;
        top: 50%;
      }
      .mod-mock.canvas .mm-node.on {
        border-color: var(--edge-gold, var(--accent));
        background: color-mix(in oklab, var(--accent) 12%, #181109);
      }
      .mod-mock.canvas .mm-edge {
        position: absolute;
        left: 37%;
        top: 45%;
        width: 17%;
        height: 1.5px;
        background: linear-gradient(90deg, transparent, var(--accent), transparent);
        transform: rotate(20deg);
        transform-origin: left center;
      }
      .mod-mock.canvas .mm-plus {
        position: absolute;
        left: calc(50% + 88px - 10px);
        top: calc(50% + 22px);
        width: 22px;
        height: 22px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: var(--accent);
        color: var(--cta-ink, #181109);
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
      }
      /* Studio */
      .mod-mock.studio .mod-chat {
        width: 80%; max-width: 320px;
      }
      .mod-mock.studio .mod-msg {
        background: var(--gradient-cta);
        color: var(--cta-ink);
        padding: 8px 14px;
        border-radius: 8px;
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 600;
        margin-bottom: 12px;
        max-width: 80%;
        margin-left: auto;
      }
      .mod-mock.studio .mod-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
      }
      .mod-mock.studio .mod-grid span {
        aspect-ratio: 1;
        background: linear-gradient(135deg, var(--ink-3), var(--ink-2));
        border: 1px solid var(--line);
        border-radius: 4px;
      }
      .mod-mock.studio .mod-grid span.on {
        background:
          radial-gradient(at 30% 30%, color-mix(in oklab, var(--accent) 70%, transparent), transparent 65%),
          linear-gradient(135deg, #2a1810, #5a2818);
        border-color: var(--accent);
        box-shadow: 0 0 16px color-mix(in oklab, var(--accent) 30%, transparent);
      }
      /* Director */
      .mod-mock.director .mod-compare {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        width: 80%; max-width: 280px;
        aspect-ratio: 4/3;
      }
      .mod-comp-cell {
        background: linear-gradient(135deg, var(--ink-3), var(--ink-2));
        border: 1px solid var(--line);
        border-radius: 4px;
      }
      .mod-comp-cell.on {
        background:
          linear-gradient(135deg, #1a1f2e, #1a3552);
        border-color: #4ea8f7;
        box-shadow: 0 0 16px color-mix(in oklab, #4ea8f7 30%, transparent);
      }
      /* Stage */
      .mod-mock.stage .mod-script {
        width: 90%; max-width: 340px;
        display: flex; flex-direction: column; gap: 6px;
      }
      .mod-beat-row {
        display: grid;
        grid-template-columns: 18px 38px 1fr;
        gap: 8px;
        align-items: center;
        padding: 6px 10px;
        background: color-mix(in oklab, var(--ink-3) 60%, transparent);
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
      }
      .mod-beat-row.sel {
        border-color: #2dd4bf;
        background: color-mix(in oklab, #2dd4bf 6%, var(--ink-3));
      }
      .b-idx {
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 700;
        color: var(--paper-mute);
        text-align: center;
      }
      .mod-beat-row.sel .b-idx { color: #2dd4bf; }
      .b-thumb {
        width: 38px; height: 22px;
        border-radius: 2px;
        background: linear-gradient(135deg, #0f2622 0%, color-mix(in oklab, #2dd4bf 50%, #0f2622) 100%);
      }
      .b-thumb.t2 { background: linear-gradient(135deg, #1a2030 0%, color-mix(in oklab, #4ea8f7 50%, #1a2030) 100%); }
      .b-thumb.t3 { background: linear-gradient(135deg, #2a1810 0%, color-mix(in oklab, var(--accent) 50%, #2a1810) 100%); }
      .b-text {
        font-family: var(--font-serif);
        font-style: italic;
        font-size: 11.5px;
        color: var(--paper-dim);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      /* Editor */
      .mod-mock.editor {
        flex-direction: column;
        gap: 6px;
      }
      .mod-mock.editor .mod-preview {
        width: 80%; max-width: 280px;
        aspect-ratio: 16/9;
        background:
          radial-gradient(at 30% 40%, color-mix(in oklab, oklch(0.85 0.18 130) 25%, transparent), transparent 60%),
          linear-gradient(135deg, #0d1f0a 0%, #1a3520 100%);
        border-radius: var(--radius-md);
        border: 1px solid var(--line);
        margin-bottom: 8px;
      }
      .mod-mock.editor .mod-timeline {
        width: 80%; max-width: 280px;
        display: flex;
        gap: 2px;
        height: 16px;
      }
      .mod-mock.editor .mod-timeline.audio {
        height: 12px;
        opacity: 0.7;
      }
      .mod-clip {
        height: 100%;
        border-radius: 2px;
        border: 1px solid color-mix(in oklab, oklch(0.85 0.18 130) 30%, var(--line));
      }
      .mod-clip.c1 { width: 28%; background: linear-gradient(135deg, color-mix(in oklab, oklch(0.85 0.18 130) 30%, var(--ink-3)), var(--ink-3)); }
      .mod-clip.c2 { width: 36%; background: linear-gradient(135deg, color-mix(in oklab, oklch(0.85 0.18 130) 25%, var(--ink-3)), var(--ink-3)); }
      .mod-clip.c3 { width: 32%; background: linear-gradient(135deg, color-mix(in oklab, oklch(0.85 0.18 130) 35%, var(--ink-3)), var(--ink-3)); }
      .mod-clip.wave {
        width: 100%;
        background: repeating-linear-gradient(
          90deg,
          #4ea8f7 0 2px,
          color-mix(in oklab, #4ea8f7 25%, var(--ink-2)) 2px 4px
        );
      }

      /* ═══ ENTERPRISE ═══ */
      .ld-enterprise {
        padding: 100px 32px;
        max-width: 1280px;
        margin: 0 auto;
        position: relative;
      }
      .ld-enterprise::before {
        content: "";
        position: absolute;
        inset: 0 0 0 0;
        background:
          radial-gradient(ellipse 60% 50% at 50% 0%, color-mix(in oklab, var(--accent) 6%, transparent), transparent 70%);
        pointer-events: none;
      }
      .ld-ent-grid {
        display: grid;
        grid-template-columns: 1fr 1.15fr 1fr;
        gap: 24px;
        position: relative;
        z-index: 1;
      }
      .ld-ent-card {
        background: linear-gradient(180deg,
          color-mix(in oklab, var(--ink-2) 88%, transparent) 0%,
          color-mix(in oklab, var(--ink) 94%, transparent) 100%);
        border: 1px solid color-mix(in oklab, var(--paper) 7%, var(--line));
        border-radius: var(--radius-xl);
        padding: 32px 32px 28px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        position: relative;
        transition: all var(--ease-spring);
      }
      .ld-ent-card:hover {
        transform: translateY(-4px);
        border-color: color-mix(in oklab, var(--accent) 30%, var(--line));
        box-shadow:
          0 24px 48px rgba(0,0,0,0.4),
          0 0 0 1px color-mix(in oklab, var(--accent) 18%, transparent);
      }
      .ld-ent-card.featured {
        background: linear-gradient(180deg,
          color-mix(in oklab, var(--accent) 8%, var(--ink-2)) 0%,
          color-mix(in oklab, var(--ink) 92%, transparent) 100%);
        border-color: color-mix(in oklab, var(--accent) 35%, var(--line));
        transform: translateY(-8px);
        box-shadow:
          0 28px 56px rgba(0,0,0,0.45),
          0 0 0 1px color-mix(in oklab, var(--accent) 25%, transparent);
      }
      .ld-ent-card.featured:hover {
        transform: translateY(-12px);
      }
      .ld-ent-icon-wrap {
        width: 52px; height: 52px;
        display: grid; place-items: center;
        background: color-mix(in oklab, var(--accent) 10%, var(--ink-3));
        border: 1px solid color-mix(in oklab, var(--accent) 30%, var(--line));
        border-radius: var(--radius-md);
        color: var(--accent);
      }
      .ld-ent-card.featured .ld-ent-icon-wrap {
        background: var(--gradient-cta);
        color: var(--cta-ink);
        border-color: transparent;
        box-shadow: var(--shadow-cta);
      }
      .ld-ent-num {
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.16em;
        color: var(--paper-mute);
      }
      .ld-ent-card.featured .ld-ent-num { color: var(--accent); }
      .ld-ent-title {
        font-family: var(--font-serif);
        font-style: italic;
        font-weight: 400;
        font-size: 28px;
        line-height: 1.15;
        color: var(--paper);
        margin: 0;
        letter-spacing: -0.01em;
      }
      .ld-ent-desc {
        font-family: var(--font-sans);
        font-size: 14.5px;
        line-height: 1.65;
        color: var(--paper-dim);
        margin: 0 0 6px;
      }
      .ld-ent-list {
        list-style: none;
        padding: 14px 0 0;
        margin: auto 0 0;
        border-top: 1px solid color-mix(in oklab, var(--paper) 6%, var(--line));
        display: flex;
        flex-direction: column;
        gap: 9px;
      }
      .ld-ent-list li {
        font-family: var(--font-mono);
        font-size: 11.5px;
        line-height: 1.5;
        color: var(--paper-dim);
        letter-spacing: 0.02em;
        padding-left: 18px;
        position: relative;
      }
      .ld-ent-list li::before {
        content: "✓";
        position: absolute;
        left: 0;
        color: var(--accent);
        font-weight: 700;
      }
      .ld-ent-card.featured .ld-ent-list li::before {
        color: var(--accent);
      }

      .ld-ent-foot {
        margin-top: 48px;
        padding: 32px 40px;
        background: linear-gradient(135deg,
          color-mix(in oklab, var(--ink-2) 80%, transparent) 0%,
          color-mix(in oklab, var(--accent) 6%, var(--ink)) 100%);
        border: 1px solid color-mix(in oklab, var(--accent) 25%, var(--line));
        border-radius: var(--radius-xl);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 32px;
        flex-wrap: wrap;
        position: relative;
        z-index: 1;
      }
      .ld-ent-foot-text {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .ld-ent-foot-text strong {
        font-family: var(--font-serif);
        font-style: italic;
        font-size: 19px;
        font-weight: 500;
        color: var(--paper);
        line-height: 1.3;
      }
      .ld-ent-foot-text span {
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.06em;
        color: var(--paper-mute);
      }

      /* CTA · 三档:primary / secondary.highlight / tertiary */
      .ld-cta-secondary.highlight {
        border-color: color-mix(in oklab, var(--accent) 45%, var(--line));
        color: var(--accent);
        background: color-mix(in oklab, var(--accent) 6%, transparent);
      }
      .ld-cta-secondary.highlight:hover {
        background: color-mix(in oklab, var(--accent) 12%, transparent);
        border-color: var(--accent);
        color: var(--paper);
      }
      .ld-cta-tertiary {
        font-family: var(--font-mono);
        font-size: 11.5px;
        font-weight: 600;
        letter-spacing: 0.06em;
        color: var(--paper-mute);
        text-decoration: none;
        padding: 12px 8px;
        transition: color 0.15s;
      }
      .ld-cta-tertiary:hover {
        color: var(--paper);
      }

      /* Hot 标记的 nav 链接 */
      .ld-nav a.hot {
        color: var(--accent);
        position: relative;
      }
      .ld-nav a.hot::after {
        content: "";
        position: absolute;
        top: -2px;
        right: -8px;
        width: 5px; height: 5px;
        border-radius: 50%;
        background: var(--accent);
        box-shadow: 0 0 8px var(--accent);
      }
      .ld-nav a.hot:hover {
        color: color-mix(in oklab, var(--accent) 70%, var(--paper));
      }

      /* ═══ WHY ═══ */
      .ld-why-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1px;
        background: var(--line);
        border: 1px solid var(--line);
        border-radius: var(--radius-xl);
        overflow: hidden;
      }
      .ld-why-card {
        padding: 36px 32px;
        background: var(--ink);
        display: flex;
        flex-direction: column;
        gap: 14px;
        transition: background 0.2s;
      }
      .ld-why-card:hover { background: color-mix(in oklab, var(--ink-2) 30%, var(--ink)); }
      .ld-why-num {
        font-family: var(--font-mono);
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.12em;
        color: var(--accent);
      }
      .ld-why-title {
        font-family: var(--font-serif);
        font-style: italic;
        font-weight: 400;
        font-size: 26px;
        line-height: 1.2;
        color: var(--paper);
        margin: 0;
        letter-spacing: -0.01em;
      }
      .ld-why-body {
        font-family: var(--font-sans);
        font-size: 14.5px;
        line-height: 1.65;
        color: var(--paper-dim);
        margin: 0;
      }

      /* ═══ TEMPLATES ═══ */
      .ld-templates {
        padding: 100px 32px;
        max-width: 1320px;
        margin: 0 auto;
        position: relative;
      }
      .ld-templates::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse 50% 40% at 50% 100%, color-mix(in oklab, var(--accent) 5%, transparent), transparent 70%);
        pointer-events: none;
      }
      /* 分类 tabs */
      .ld-tpl-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
        margin-bottom: 40px;
      }
      .ld-tpl-tab {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: color-mix(in oklab, var(--ink-2) 50%, transparent);
        border: 1px solid var(--line);
        color: var(--paper-dim);
        font-family: var(--font-mono);
        font-size: 11.5px;
        font-weight: 600;
        letter-spacing: 0.06em;
        border-radius: 999px;
        cursor: pointer;
        transition: all var(--ease-quick);
      }
      .ld-tpl-tab em {
        font-style: normal;
        font-size: 10px;
        font-weight: 700;
        color: var(--paper-mute);
        padding: 0 6px;
        background: color-mix(in oklab, var(--paper) 6%, transparent);
        border-radius: 999px;
      }
      .ld-tpl-tab:hover {
        color: var(--paper);
        border-color: color-mix(in oklab, var(--paper) 18%, var(--line));
      }
      .ld-tpl-tab.on {
        background: color-mix(in oklab, var(--accent) 12%, var(--ink-2));
        border-color: var(--accent);
        color: var(--accent);
      }
      .ld-tpl-tab.on em {
        background: color-mix(in oklab, var(--accent) 20%, transparent);
        color: var(--accent);
      }

      /* 模板墙 4x3 */
      .ld-tpl-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 20px;
        position: relative;
        z-index: 1;
      }
      .ld-tpl-card {
        background: linear-gradient(180deg,
          color-mix(in oklab, var(--ink-2) 80%, transparent) 0%,
          color-mix(in oklab, var(--ink) 92%, transparent) 100%);
        border: 1px solid color-mix(in oklab, var(--paper) 6%, var(--line));
        border-radius: var(--radius-lg);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transition: all var(--ease-spring);
        cursor: pointer;
      }
      .ld-tpl-card:hover {
        transform: translateY(-4px);
        border-color: var(--tpl-color);
        box-shadow:
          0 16px 32px rgba(0,0,0,0.4),
          0 0 0 1px var(--tpl-color);
      }
      .ld-tpl-card:hover .ld-tpl-bg { transform: scale(1.06); }
      .ld-tpl-card:hover .ld-tpl-shape { transform: var(--shape-hover, scale(1.08) rotate(2deg)); }

      /* 主题色 —— 8 个色系循环 */
      .ld-tpl-card[data-theme="1"] { --tpl-color: oklch(0.72 0.17 40);  --tpl-bg-1: #2a1810; --tpl-bg-2: #5a2818; }
      .ld-tpl-card[data-theme="2"] { --tpl-color: #4ea8f7; --tpl-bg-1: #0d1a2e; --tpl-bg-2: #1a3552; }
      .ld-tpl-card[data-theme="3"] { --tpl-color: #2dd4bf; --tpl-bg-1: #0a2622; --tpl-bg-2: #15433c; }
      .ld-tpl-card[data-theme="4"] { --tpl-color: oklch(0.85 0.18 130); --tpl-bg-1: #0d1f0a; --tpl-bg-2: #1a3520; }
      .ld-tpl-card[data-theme="5"] { --tpl-color: #ff5d8f; --tpl-bg-1: #2a0d1f; --tpl-bg-2: #4d1a3a; }
      .ld-tpl-card[data-theme="6"] { --tpl-color: #ffd460; --tpl-bg-1: #2a200d; --tpl-bg-2: #4d3a1a; }
      .ld-tpl-card[data-theme="7"] { --tpl-color: #5b9eff; --tpl-bg-1: #0a0d2e; --tpl-bg-2: #1a2a5a; }
      .ld-tpl-card[data-theme="8"] { --tpl-color: #3ddc97; --tpl-bg-1: #0a2a1f; --tpl-bg-2: #1a4530; }

      .ld-tpl-thumb {
        position: relative;
        background: var(--ink);
        overflow: hidden;
        border-bottom: 1px solid var(--line);
      }
      .ld-tpl-stage {
        position: relative;
        width: 100%;
        overflow: hidden;
      }
      .ld-tpl-bg {
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, var(--tpl-bg-1) 0%, var(--tpl-bg-2) 100%);
        transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .ld-tpl-bg.variant-0 {
        background:
          radial-gradient(at 30% 30%, color-mix(in oklab, var(--tpl-color) 40%, transparent), transparent 60%),
          linear-gradient(135deg, var(--tpl-bg-1) 0%, var(--tpl-bg-2) 100%);
      }
      .ld-tpl-bg.variant-1 {
        background:
          radial-gradient(at 70% 30%, color-mix(in oklab, var(--tpl-color) 35%, transparent), transparent 65%),
          linear-gradient(160deg, var(--tpl-bg-1) 0%, var(--tpl-bg-2) 100%);
      }
      .ld-tpl-bg.variant-2 {
        background:
          radial-gradient(at 50% 80%, color-mix(in oklab, var(--tpl-color) 45%, transparent), transparent 60%),
          linear-gradient(195deg, var(--tpl-bg-2) 0%, var(--tpl-bg-1) 100%);
      }
      .ld-tpl-bg.variant-3 {
        background:
          linear-gradient(135deg,
            var(--tpl-bg-1) 0%,
            color-mix(in oklab, var(--tpl-color) 30%, var(--tpl-bg-2)) 50%,
            var(--tpl-bg-2) 100%);
      }
      .ld-tpl-shape {
        position: absolute;
        inset: 0;
        margin: auto;
        transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .ld-tpl-shape.shape-0 {
        /* 圆 */
        width: 38%; height: 38%; top: 22%; left: 28%;
        background: color-mix(in oklab, var(--tpl-color) 60%, transparent);
        border-radius: 50%;
        filter: blur(2px);
        box-shadow: 0 0 40px color-mix(in oklab, var(--tpl-color) 50%, transparent);
      }
      .ld-tpl-shape.shape-1 {
        /* 三角(用 clip-path) */
        width: 50%; height: 45%; top: 25%; left: 25%;
        background: linear-gradient(180deg, color-mix(in oklab, var(--tpl-color) 70%, transparent), color-mix(in oklab, var(--tpl-color) 30%, transparent));
        clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
      }
      .ld-tpl-shape.shape-2 {
        /* 双圆叠 */
        width: 32%; height: 32%; top: 30%; left: 22%;
        background: color-mix(in oklab, var(--tpl-color) 55%, transparent);
        border-radius: 50%;
        box-shadow:
          0 0 24px color-mix(in oklab, var(--tpl-color) 40%, transparent),
          24% 24% 0 -4% color-mix(in oklab, var(--tpl-color) 40%, transparent);
      }
      .ld-tpl-shape.shape-3 {
        /* 横向波纹 */
        width: 80%; height: 20%; top: 40%; left: 10%;
        background: repeating-linear-gradient(
          90deg,
          color-mix(in oklab, var(--tpl-color) 70%, transparent) 0 8px,
          transparent 8px 16px
        );
        opacity: 0.85;
      }

      .ld-tpl-cap {
        position: absolute;
        left: 8%; right: 8%; bottom: 8%;
        display: flex;
        flex-direction: column;
        gap: 3px;
        align-items: center;
      }
      .ld-tpl-cap-bar {
        height: 4px;
        width: 70%;
        background: rgba(255,255,255,0.85);
        border-radius: 2px;
      }
      .ld-tpl-cap-bar.short {
        width: 40%;
        opacity: 0.6;
      }
      .ld-tpl-corner {
        position: absolute;
        top: 8px; right: 8px;
        font-family: var(--font-mono);
        font-size: 8.5px;
        font-weight: 700;
        letter-spacing: 0.08em;
        padding: 2px 6px;
        background: rgba(0,0,0,0.55);
        backdrop-filter: blur(4px);
        color: var(--tpl-color);
        border-radius: 3px;
        border: 1px solid color-mix(in oklab, var(--tpl-color) 30%, transparent);
      }
      .ld-tpl-aspect {
        position: absolute;
        bottom: 8px; left: 8px;
        font-family: var(--font-mono);
        font-size: 8.5px;
        font-weight: 700;
        letter-spacing: 0.08em;
        padding: 2px 6px;
        background: rgba(0,0,0,0.6);
        color: rgba(255,255,255,0.85);
        border-radius: 3px;
        display: none; /* 已经用 corner 显示了,这个保留位 */
      }

      .ld-tpl-body {
        padding: 14px 16px 16px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
      }
      .ld-tpl-name {
        font-family: var(--font-serif);
        font-style: italic;
        font-weight: 400;
        font-size: 17px;
        line-height: 1.25;
        color: var(--paper);
        margin: 0;
        letter-spacing: -0.005em;
      }
      .ld-tpl-tag {
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.06em;
        color: var(--tpl-color);
        margin-top: 2px;
      }
      .ld-tpl-meta {
        margin-top: auto;
        padding-top: 8px;
        display: flex;
        align-items: center;
        gap: 6px;
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--paper-mute);
        letter-spacing: 0.04em;
      }
      .ld-tpl-meta-sep { opacity: 0.4; }

      /* 模板底部 CTA */
      .ld-tpl-foot {
        margin-top: 56px;
        padding: 28px 36px;
        background: linear-gradient(135deg,
          color-mix(in oklab, var(--ink-2) 70%, transparent) 0%,
          color-mix(in oklab, var(--accent) 4%, var(--ink)) 100%);
        border: 1px dashed color-mix(in oklab, var(--accent) 30%, var(--line));
        border-radius: var(--radius-xl);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 32px;
        flex-wrap: wrap;
      }
      .ld-tpl-foot-text {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-width: 600px;
      }
      .ld-tpl-foot-text strong {
        font-family: var(--font-serif);
        font-style: italic;
        font-size: 18px;
        font-weight: 500;
        color: var(--paper);
        line-height: 1.35;
      }
      .ld-tpl-foot-text span {
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.04em;
        color: var(--paper-mute);
      }
      .ld-tpl-foot-cta {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      /* ═══ USE CASES ═══ */
      .ld-uses-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        max-width: 960px;
        margin: 0 auto;
      }
      .ld-use-chip {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 18px 22px;
        background: color-mix(in oklab, var(--ink-2) 50%, transparent);
        border: 1px solid var(--line);
        border-radius: var(--radius-lg);
        transition: all var(--ease-spring);
      }
      .ld-use-chip:hover {
        border-color: color-mix(in oklab, var(--accent) 35%, var(--line));
        background: color-mix(in oklab, var(--accent) 4%, var(--ink-2));
        transform: translateY(-2px);
      }
      .ld-use-icon {
        font-family: var(--font-serif);
        font-size: 22px;
        color: var(--accent);
        line-height: 1;
      }
      .ld-use-label {
        font-family: var(--font-sans);
        font-size: 14px;
        font-weight: 600;
        color: var(--paper);
      }

      /* ═══ FINAL CTA ═══ */
      .ld-final {
        text-align: center;
        padding: 140px 32px;
      }
      .ld-final-inner {
        max-width: 800px;
        margin: 0 auto;
      }
      .ld-final-title {
        font-family: var(--font-serif);
        font-style: italic;
        font-weight: 400;
        font-size: clamp(40px, 6vw, 76px);
        line-height: 1.05;
        letter-spacing: -0.02em;
        color: var(--paper);
        margin: 0 0 48px;
      }
      .ld-final-title em {
        color: var(--accent);
        font-style: italic;
      }
      .ld-final-cta {
        display: flex;
        gap: 16px;
        justify-content: center;
        align-items: center;
        flex-wrap: wrap;
        margin-bottom: 24px;
      }
      .ld-final-meta {
        font-family: var(--font-mono);
        font-size: 11.5px;
        font-weight: 600;
        letter-spacing: 0.06em;
        color: var(--paper-mute);
      }

      /* ═══ FOOTER ═══ */
      .ld-footer {
        border-top: 1px solid color-mix(in oklab, var(--paper) 6%, var(--line));
        padding: 64px 32px 32px;
        background: color-mix(in oklab, var(--ink-2) 30%, var(--ink));
      }
      .ld-footer-inner {
        max-width: 1280px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: 1fr 2fr;
        gap: 64px;
      }
      .ld-footer-brand {
        max-width: 280px;
      }
      .ld-footer-tag {
        margin-top: 14px;
        font-family: var(--font-sans);
        font-size: 13px;
        line-height: 1.55;
        color: var(--paper-mute);
      }
      .ld-footer-cols {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 32px;
      }
      .ld-fcol-title {
        font-family: var(--font-mono);
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.16em;
        color: var(--paper-mute);
        text-transform: uppercase;
        margin-bottom: 18px;
      }
      .ld-fcol ul {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .ld-fcol a {
        font-family: var(--font-sans);
        font-size: 13.5px;
        color: var(--paper-dim);
        text-decoration: none;
        transition: color 0.15s;
      }
      .ld-fcol a:hover { color: var(--paper); }

      .ld-footer-foot {
        max-width: 1280px;
        margin: 48px auto 0;
        padding-top: 24px;
        border-top: 1px solid var(--line);
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.06em;
        color: var(--paper-mute);
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .ld-footer-foot-sep { opacity: 0.5; }

      /* ═══ 响应式 ═══ */
      @media (max-width: 980px) {
        .ld-chrome-inner { grid-template-columns: auto 1fr auto; gap: 16px; }
        .ld-nav { display: none; }
        .ld-hero { padding: 60px 24px 80px; }
        .ld-hero-inner {
          grid-template-columns: 1fr;
          gap: 40px;
        }
        .ld-hero-right { min-height: 380px; }
        .ld-mockup { height: 380px; }
        .ld-modules, .ld-why, .ld-uses, .ld-final {
          padding: 64px 24px;
        }
        .ld-modules-grid { grid-template-columns: 1fr; }
        .ld-mod, .ld-mod.featured {
          grid-template-rows: 180px 1fr;
          grid-column: auto;
        }
        .ld-mod.featured .ld-mod-title { font-size: 28px; }
        .ld-why-grid { grid-template-columns: 1fr; }
        .ld-ent-grid { grid-template-columns: 1fr; }
        .ld-ent-card.featured { transform: none; }
        .ld-ent-foot { padding: 24px; }
        .ld-tpl-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; }
        .ld-tpl-foot { padding: 20px 24px; }
        .ld-footer-inner { grid-template-columns: 1fr; gap: 32px; }
        .ld-footer-cols { grid-template-columns: repeat(2, 1fr); gap: 24px; }
      }
      @media (min-width: 981px) and (max-width: 1180px) {
        .ld-tpl-grid { grid-template-columns: repeat(3, 1fr); }
      }
      @media (max-width: 560px) {
        .ld-hero-title { font-size: 44px; }
        .ld-section-title { font-size: 28px; }
        .ld-final-title { font-size: 36px; }
        .ld-footer-cols { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
