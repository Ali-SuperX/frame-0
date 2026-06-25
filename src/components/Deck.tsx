"use client";

import DeckStage from "./DeckStage";
import "@/styles/deck.css";

export default function Deck() {
  return (
    <DeckStage width={1920} height={1080}>
      {/* ============ SLIDE 1 · COVER ============ */}
      <section className="s-cover" data-label="Cover" style={{ background: "var(--ink)", color: "var(--paper)", padding: "80px 96px" }}>
        <div className="meta-top">
          <div>VOL. 01 · ISSUE 04 · APR 2026</div>
          <div className="c">AN INTRODUCTION TO FRAME/0 — AN AI CINEMA INSTRUMENT</div>
          <div className="r">N° 001 · DECK</div>
        </div>

        <div className="stack">
          <p className="kicker"><em>T/01</em> &nbsp; PRESS KIT &nbsp;·&nbsp; FOR DIRECTORS OF THE SYNTHETIC</p>
          <h1 className="big">Direct<br />the <span className="it">unseen.</span></h1>
        </div>

        <div className="foot-row">
          <div>WHAT<div className="v">A cinema that answers.</div></div>
          <div>FOR WHOM<div className="v">Directors &amp; editors.</div></div>
          <div>WITH<div className="v">Kinograph KG-9</div></div>
          <div>STATUS<div className="v">Beta 00.7 — open</div></div>
        </div>

        <div className="edge-top">
          <div className="logo">Frame<span>/</span>0</div>
          <div className="slug"><span className="dot" /><span>ROLLING · 1,248 DIRECTORS ONLINE</span></div>
          <div>01 / 08</div>
        </div>
        <div className="edge-bot">
          <div>FRAME/0 · INSTRUMENTS</div>
          <div>COVER</div>
          <div>2026</div>
        </div>
      </section>

      {/* ============ SLIDE 2 · AGENDA ============ */}
      <section data-label="Agenda" style={{ background: "var(--ink)", color: "var(--paper)", padding: "80px 96px" }}>
        <div className="edge-top">
          <div className="logo">Frame<span>/</span>0</div>
          <div className="slug"><span>CONTENTS · 07 SECTIONS</span></div>
          <div>02 / 08</div>
        </div>

        <div className="s-agenda" style={{ marginTop: 110 }}>
          <div>
            <p className="kicker">§ 02 — <em>Contents</em></p>
            <h2 className="mid">What<br />we&apos;ll<br /><em>cover.</em></h2>
          </div>

          <div className="agenda-list">
            <div className="row"><div className="n">I.</div><div className="t">The problem with the prompt box</div><div className="d">03 min</div></div>
            <div className="row on"><div className="n">II.</div><div className="t">A <em>chair</em>, not a button</div><div className="d">05 min</div></div>
            <div className="row"><div className="n">III.</div><div className="t">Three principles — Direction, Continuity, Credit</div><div className="d">04 min</div></div>
            <div className="row"><div className="n">IV.</div><div className="t">Inside the Studio</div><div className="d">06 min</div></div>
            <div className="row"><div className="n">V.</div><div className="t">Numbers that hold</div><div className="d">02 min</div></div>
            <div className="row"><div className="n">VI.</div><div className="t">The Archive, co-signed</div><div className="d">03 min</div></div>
            <div className="row"><div className="n">VII.</div><div className="t">Roll. — How to join</div><div className="d">02 min</div></div>
          </div>
        </div>

        <div className="edge-bot">
          <div>FRAME/0 · INSTRUMENTS</div>
          <div>AGENDA</div>
          <div>2026</div>
        </div>
      </section>

      {/* ============ SLIDE 3 · PROBLEM ============ */}
      <section data-label="Problem" style={{ background: "var(--ink)", color: "var(--paper)", padding: "80px 96px" }}>
        <div className="edge-top">
          <div className="logo">Frame<span>/</span>0</div>
          <div className="slug"><span>I. THE PROBLEM</span></div>
          <div>03 / 08</div>
        </div>

        <div className="s-problem" style={{ marginTop: 110 }}>
          <div>
            <p className="kicker">§ 03 — <em>The problem</em></p>
            <h2 className="mid">The prompt<br />box was<br />never a<br /><em>camera.</em></h2>
            <p className="body" style={{ marginTop: 32 }}>一行提示词生成一段影像——那更像彩票，不像创作。导演想要的是把控：每一次推镜、每一道光、每一次剪辑的呼吸。</p>
          </div>

          <div className="prob-list">
            <div className="prob-item">
              <div className="n">§ 01</div>
              <div>
                <h4>No <i>camera language.</i></h4>
                <p>大多数工具只接受&quot;描述&quot;。焦距、运镜、景别这些影像的母语全被压成了一行英文。</p>
              </div>
            </div>
            <div className="prob-item">
              <div className="n">§ 02</div>
              <div>
                <h4>Continuity <i>breaks.</i></h4>
                <p>同一个角色，下一个镜头换了张脸；同一束光，转场后变了方向。叙事在连贯性这一刻坍塌。</p>
              </div>
            </div>
            <div className="prob-item">
              <div className="n">§ 03</div>
              <div>
                <h4>Authorship <i>erased.</i></h4>
                <p>AI 是幽灵：做了一半工作，却不署名。观众无从知道是谁——或者是什么——在讲这个故事。</p>
              </div>
            </div>
          </div>
        </div>

        <div className="edge-bot">
          <div>FRAME/0 · INSTRUMENTS</div>
          <div>PROBLEM</div>
          <div>2026</div>
        </div>
      </section>

      {/* ============ SLIDE 4 · PILLARS ============ */}
      <section data-label="Pillars" style={{ background: "var(--ink)", color: "var(--paper)", padding: "80px 96px" }}>
        <div className="edge-top">
          <div className="logo">Frame<span>/</span>0</div>
          <div className="slug"><span>II. THREE PRINCIPLES</span></div>
          <div>04 / 08</div>
        </div>

        <div className="s-pillars" style={{ marginTop: 100 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "end", gap: 60 }}>
            <div>
              <p className="kicker">§ 04 — <em>On the craft</em></p>
              <h2 className="mid">Not a button.<br />A <em>chair.</em></h2>
            </div>
            <p className="body" style={{ marginBottom: 12 }}>我们的三条核心原则——它们决定了 Frame/0 的每一个像素。每一个选项，都为了让你坐回导演椅上。</p>
          </div>

          <div className="pillars-grid">
            <div className="pillar">
              <span className="num">§ 01 — PRINCIPLE</span>
              <h4>Direction, not prompting. <i>The camera moves.</i></h4>
              <p>文字是故事的开始，不是终点。像对着摄影师说话那样，调度每一次推镜、每一次焦点的呼吸——焦距、机位、运镜、光比，全部在手边。</p>
              <span className="glyph">Dolly · Crane · Pan · Tilt · Rack</span>
            </div>
            <div className="pillar">
              <span className="num">§ 02 — METHOD</span>
              <h4>Continuity is a <i>contract.</i></h4>
              <p>角色的脸、服装、光源、时间——在每一个镜头之间都保持一致。我们用 token memory + 物理约束，把这份契约写进每一帧。</p>
              <span className="glyph">Char-lock · Light-lock · Geo-lock</span>
            </div>
            <div className="pillar">
              <span className="num">§ 03 — PARTNER</span>
              <h4>The machine is <i>credited.</i></h4>
              <p>每部作品署两个名字：你与 Kinograph。它记得你的偏好、你的节奏，像一个沉默但可靠的副手。它的贡献，被看见。</p>
              <span className="glyph">Signed · Traceable · Yours</span>
            </div>
          </div>
        </div>

        <div className="edge-bot">
          <div>FRAME/0 · INSTRUMENTS</div>
          <div>PRINCIPLES</div>
          <div>2026</div>
        </div>
      </section>

      {/* ============ SLIDE 5 · STUDIO ============ */}
      <section data-label="Studio" style={{ background: "var(--ink)", color: "var(--paper)", padding: "80px 96px" }}>
        <div className="edge-top">
          <div className="logo">Frame<span>/</span>0</div>
          <div className="slug"><span>IV. INSIDE THE STUDIO</span></div>
          <div>05 / 08</div>
        </div>

        <div className="s-studio" style={{ marginTop: 100 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "end", gap: 60, marginBottom: 32 }}>
            <div>
              <p className="kicker">§ 05 — <em>The studio</em></p>
              <h3 className="sml" style={{ fontSize: 56 }}>The <em>director&apos;s</em> seat.</h3>
            </div>
            <p className="body">左：镜头清单。中：取景器 + 多轨时间线（视频 / 音频 / AI 导演）。右：参数检查器——镜头、运镜、光线、情绪曲线、合作者署名。</p>
          </div>

          <div className="studio-mock">
            {/* LEFT */}
            <div className="sm-col">
              <div className="sm-head"><span><span className="adot" />SHOT LIST</span><span>08 · 2:14</span></div>
              <div className="sm-body">
                {[
                  ["01", "Dawn, wide", "24MM · STATIC", "00:08", false],
                  ["02", "Kitchen, handheld", "35MM · HANDHELD", "00:22", false],
                  ["03", "Window, early light", "50MM · PAN", "00:14", false],
                  ["04", "Dolly in on her", "35MM · DOLLY", "00:28", true],
                  ["05", "Hands, close", "85MM · CU", "00:18", false],
                  ["06", "Whip to mirror", "50MM · WHIP", "00:12", false],
                  ["07", "She leaves", "28MM · TRACK", "00:20", false],
                  ["08", "Empty room", "24MM · STATIC", "00:12", false],
                ].map(([i, t, s, d, on]) => (
                  <div key={i as string} className={`sm-shot${on ? " on" : ""}`}>
                    <span className="i">{i}</span>
                    <div><div className="t">{t}</div><div className="s">{s}</div></div>
                    <span className="d">{d}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CENTER */}
            <div className="sm-col" style={{ display: "flex", flexDirection: "column" }}>
              <div className="sm-viewport" style={{ flex: 1 }}>
                <div className="pv" />
                <div className="sm-thirds" />
                <div className="sm-vp-ovr">
                  <div className="row">
                    <div className="grp"><span className="rec">● REC</span><span>T04/08</span><span>35MM · F1.8</span></div>
                    <div className="grp"><span>ISO 800</span><span>3200K</span></div>
                  </div>
                  <div className="row">
                    <div className="grp"><span>DOLLY IN · 0.4 M/S</span></div>
                    <div className="grp"><span>00:04:12 / 00:08:00</span></div>
                  </div>
                </div>
              </div>
              <div className="sm-timeline">
                <div className="sm-ruler" />
                <div className="sm-track">
                  <div className="lbl"><span className="td" style={{ background: "var(--accent)" }} />VIDEO</div>
                  <div className="sm-lane">
                    <div className="sm-clip" style={{ left: "0", width: "12%" }}>T01</div>
                    <div className="sm-clip" style={{ left: "12.5%", width: "15%" }}>T02 · KITCHEN</div>
                    <div className="sm-clip" style={{ left: "28%", width: "10%" }}>T03</div>
                    <div className="sm-clip" style={{ left: "38.5%", width: "20%" }}>T04 · DOLLY</div>
                    <div className="sm-clip" style={{ left: "59%", width: "14%" }}>T05 · CU</div>
                    <div className="sm-clip" style={{ left: "73.5%", width: "11%" }}>T06</div>
                    <div className="sm-clip" style={{ left: "85%", width: "15%" }}>T07</div>
                  </div>
                </div>
                <div className="sm-track">
                  <div className="lbl"><span className="td" style={{ background: "var(--accent-2)" }} />AUDIO</div>
                  <div className="sm-lane">
                    <div className="sm-clip aud" style={{ left: "0", width: "38.5%" }}>AMBIENT · MORNING</div>
                    <div className="sm-clip aud" style={{ left: "38.5%", width: "61.5%" }}>SCORE · STRINGS · BMIN</div>
                  </div>
                </div>
                <div className="sm-track">
                  <div className="lbl"><span className="td" style={{ background: "var(--signal)" }} />AI DIR.</div>
                  <div className="sm-lane">
                    <div className="sm-clip ai" style={{ left: "10%", width: "8%" }}>CONT.</div>
                    <div className="sm-clip ai" style={{ left: "40%", width: "18%" }}>CHAR LOCK</div>
                    <div className="sm-clip ai" style={{ left: "65%", width: "12%" }}>COLOR</div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT */}
            <div className="sm-col" style={{ overflow: "auto" }}>
              <div className="sm-head"><span><span className="adot" />T04 · INSPECT</span><span>LIVE</span></div>
              <div className="sm-insp">
                <div className="k">DIRECTION · PROMPT</div>
                <div className="sm-prompt">一个女人站在厨房的窗前，<span className="at">@camera</span> 缓慢推镜穿过雾气，<span className="at">@focus</span> 从光斑到她的睫毛，<span className="at">@mood</span> 静谧。</div>
              </div>
              <div className="sm-insp">
                <div className="k">LENS <span className="v">35MM · F1.8</span></div>
                <div className="sm-slider"><div className="bg" /><div className="fl" style={{ width: "22%" }} /><div className="kn" style={{ left: "22%" }} /></div>
              </div>
              <div className="sm-insp">
                <div className="k">MOTION <span className="v">DOLLY · 0.4 M/S</span></div>
                <div className="sm-pills">
                  {["Static", "Pan", "Tilt", "Dolly", "Crane", "Handheld"].map((m) => (
                    <span key={m} className={`sm-pill${m === "Dolly" ? " on" : ""}`}>{m}</span>
                  ))}
                </div>
              </div>
              <div className="sm-insp">
                <div className="k">COLLABORATOR</div>
                <div style={{ display: "grid", gridTemplateColumns: "40px 1fr", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, var(--accent), var(--ink-3))" }} />
                  <div>
                    <div style={{ fontFamily: "var(--font-serif)", fontSize: 16, color: "var(--paper)" }}>Kinograph · <span style={{ color: "var(--accent)" }}>KG-9</span></div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--paper-mute)", textTransform: "uppercase", marginTop: 2 }}>CO-DIRECTOR · 47 SHOTS</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="edge-bot">
          <div>FRAME/0 · INSTRUMENTS</div>
          <div>STUDIO</div>
          <div>2026</div>
        </div>
      </section>

      {/* ============ SLIDE 6 · METRICS ============ */}
      <section data-label="Metrics" style={{ background: "var(--ink)", color: "var(--paper)", padding: "80px 96px" }}>
        <div className="edge-top">
          <div className="logo">Frame<span>/</span>0</div>
          <div className="slug"><span>V. NUMBERS THAT HOLD</span></div>
          <div>06 / 08</div>
        </div>

        <div className="s-metrics" style={{ marginTop: 80 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "end", gap: 60 }}>
            <div>
              <p className="kicker">§ 06 — <em>In numbers</em></p>
              <h2 className="mid">Measured,<br />then <em>kept.</em></h2>
            </div>
            <p className="body">四个指标，四份承诺。不是卖点，是基线——我们拿实际的运行数据衡量自己。</p>
          </div>

          <div className="metric-grid">
            <div className="metric">
              <span className="k">LATENCY · PREVIEW</span>
              <div className="big">240<i>ms</i><span className="u">real-time scrubbing</span></div>
              <div className="cap">拖动时间线时，每一帧都立刻回应——像剪辑台，而不是等待队列。</div>
            </div>
            <div className="metric">
              <span className="k">OUTPUT · MAX</span>
              <div className="big">4<i>K</i><span className="u">prores · up to 12 min</span></div>
              <div className="cap">院线级码流、可交付的母片；不是为了截图，是为了真正上映。</div>
            </div>
            <div className="metric">
              <span className="k">CONTINUITY · LOCK</span>
              <div className="big">97<i>%</i><span className="u">character fidelity</span></div>
              <div className="cap">跨镜头角色一致性，在 1,000 次内部盲测中保持稳定。</div>
            </div>
            <div className="metric">
              <span className="k">COMMUNITY · LIVE</span>
              <div className="big">1.2<i>k</i><span className="u">directors online now</span></div>
              <div className="cap">每一部作品都带 C2PA 签名——署你的名，也署它的名。</div>
            </div>
          </div>
        </div>

        <div className="edge-bot">
          <div>FRAME/0 · INSTRUMENTS</div>
          <div>METRICS</div>
          <div>2026</div>
        </div>
      </section>

      {/* ============ SLIDE 7 · ARCHIVE ============ */}
      <section data-label="Archive" style={{ background: "var(--ink)", color: "var(--paper)", padding: "80px 96px" }}>
        <div className="edge-top">
          <div className="logo">Frame<span>/</span>0</div>
          <div className="slug"><span>VI. THE ARCHIVE</span></div>
          <div>07 / 08</div>
        </div>

        <div className="s-archive" style={{ marginTop: 40, paddingBottom: 20 }}>
          <div className="ar-head-row">
            <div>
              <p className="kicker">§ 07 — <em>Co-signed</em></p>
              <h2 className="mid">Directed<br /><em>together.</em></h2>
            </div>
            <div className="ar-toggle">
              <span className="on">Editorial</span><span>Grid</span><span>Strip</span>
            </div>
          </div>

          <div className="works">
            <article className="work xl">
              <div className="fr"><div className="img-a" style={{ position: "absolute", inset: 0 }} /><div className="scan" /><div className="ov" /><span className="run">FEATURED · 08:22</span><span className="dur">04K · PRORES</span></div>
              <h3>A Room Made of Hours</h3>
              <div className="by">BY LIN WEI &nbsp;·&nbsp; WITH <b>KINOGRAPH KG-9</b></div>
            </article>
            <article className="work m">
              <div className="fr"><div className="img-b" style={{ position: "absolute", inset: 0 }} /><div className="scan" /><div className="ov" /><span className="run">031</span><span className="dur">01:08</span></div>
              <h3>The Swimmer Returns</h3>
              <div className="by">BY A. OKOYE &nbsp;·&nbsp; <b>KG-9</b></div>
            </article>
            <article className="work m">
              <div className="fr"><div className="img-c" style={{ position: "absolute", inset: 0 }} /><div className="scan" /><div className="ov" /><span className="run">029</span><span className="dur">03:40</span></div>
              <h3>Notes on a Desert</h3>
              <div className="by">BY R. PATEL &nbsp;·&nbsp; <b>LUMIÈRE</b></div>
            </article>
          </div>
        </div>

        <div className="edge-bot">
          <div>FRAME/0 · INSTRUMENTS</div>
          <div>ARCHIVE</div>
          <div>2026</div>
        </div>
      </section>

      {/* ============ SLIDE 8 · CTA ============ */}
      <section className="s-cta" data-label="Roll" style={{ background: "var(--ink)", color: "var(--paper)", padding: "80px 96px" }}>
        <div className="edge-top">
          <div className="logo">Frame<span>/</span>0</div>
          <div className="slug"><span>VII. CURTAIN — HOW TO JOIN</span></div>
          <div>08 / 08</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 80, alignItems: "start", marginTop: 40 }}>
          <div>
            <p className="kicker" style={{ marginBottom: 56 }}>§ 08 &nbsp; <em>Begin roll</em></p>
            <h1 className="big" style={{ fontSize: 200 }}><span className="it">Roll.</span></h1>
            <p className="lede" style={{ marginTop: 48 }}>合上这份 deck，打开浏览器——按下 Roll，第一帧在 240 毫秒内到达你的取景器。</p>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 10 }}>BETA · NO INVITE</div>
            <div className="qr"><div className="grid" /></div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, letterSpacing: "0.14em", color: "var(--paper-dim)", marginTop: 18 }}>FRAME-ZERO.STUDIO</div>
          </div>
        </div>

        <div className="colophon">
          <div>DIRECTOR<div className="v">You</div></div>
          <div>CO-DIRECTOR<div className="v">Kinograph KG-9</div></div>
          <div>EDITION<div className="v">N° 047 / 1000</div></div>
          <div>SIGNED<div className="v">C2PA · verified</div></div>
        </div>

        <div className="edge-bot">
          <div>FRAME/0 · INSTRUMENTS · SHANGHAI · BERLIN</div>
          <div>END · ROLL CREDITS</div>
          <div>© 2026</div>
        </div>
      </section>
    </DeckStage>
  );
}
