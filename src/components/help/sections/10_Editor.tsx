import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";
import { SpecTable } from "../ui/SpecTable";

export function Sec10Editor() {
  return (
    <HelpSection id="editor" no="10" title="多轨剪辑 Editor" group="后期与归档">
      <p className="lead">
        浏览器内的非线性视频编辑器，对标 Premiere / Final Cut 的核心子集。完成从粗剪到精修
        不需要切换到任何外部工具。底层 <strong>FFmpeg.wasm 0.12</strong> 渲染，纯浏览器算力。
      </p>

      <H3 id="editor-tracks">轨道系统</H3>
      <p>
        无限数量的视频轨与音频轨。点 + 添加新轨道，右键空轨道删除。
        拖拽 clip 到任意轨道任意时间位置，精确控制叠放顺序与时间对齐。
      </p>
      <SpecTable
        headers={["轨道类型", "支持媒体", "叠加规则"]}
        rows={[
          ["视频轨", "MP4 / WebM / MOV / 图片", "上层覆盖下层（z-index 同 PiP）"],
          ["音频轨", "MP3 / WAV / AAC", "所有音频轨同时混合 (mix)"],
        ]}
      />

      <H3 id="editor-import">素材导入</H3>
      <ul>
        <li><strong>从 AI 结果直接拖入</strong> — 工坊/导演台生成的视频在档案里点&quot;拿去剪&quot;，自动加到当前时间线</li>
        <li><strong>本地文件上传</strong> — 顶栏 + 号，或直接拖文件到编辑器空区域</li>
        <li><strong>图片自动转 5s 静帧 clip</strong> — PNG/JPG/WebP 默认占 5 秒，可拖拽延长</li>
      </ul>
      <p>支持格式：MP4、WebM、MOV、MP3、WAV、AAC、PNG、JPG、WebP。</p>

      <H3 id="editor-filters">9 种滤镜预设</H3>
      <p>选中 clip 后在右侧 Inspector 面板一键应用：</p>
      <SpecTable
        headers={["滤镜", "效果"]}
        rows={[
          ["None", "原画无处理"],
          ["Warm", "暖色调，提升橙黄"],
          ["Cool", "冷色调，提升蓝青"],
          ["Cinematic", "电影感 (S 曲线 + 略降饱和)"],
          ["B&W", "黑白"],
          ["Vintage", "复古褪色"],
          ["Vivid", "鲜艳高饱和"],
          ["Dramatic", "戏剧高对比"],
          ["Pastel", "柔和马卡龙色"],
        ]}
      />
      <p>实时预览，即选即看。</p>

      <H3 id="editor-pip">画中画 (PiP) 定位</H3>
      <p>
        为上层轨道的素材设定 X / Y 坐标偏移和缩放比例 (0.1x – 2x)，
        实现画中画、角标 Logo、分屏对比等多画面合成场景。
      </p>

      <H3 id="editor-transitions">逐片段转场</H3>
      <p>每个 clip 独立设置入场转场效果：</p>
      <SpecTable
        headers={["转场", "动画", "默认时长"]}
        rows={[
          ["Fade", "淡入", "0.5s"],
          ["Slide", "从左滑入", "0.5s"],
          ["Zoom", "缩放入", "0.5s"],
          ["Spin", "旋转入", "0.6s"],
          ["Wipe", "擦除", "0.5s"],
        ]}
      />
      <p>可自定义转场时长（0.1s – 2s），时间线上以 <code>⟿</code> 标记显示。</p>

      <H3 id="editor-speed">速度曲线</H3>
      <p>突破线性变速的限制。5 种曲线模拟电影级升格/降格效果：</p>
      <ul>
        <li><strong>Linear</strong> — 匀速（默认）</li>
        <li><strong>Ease-in</strong> — 由慢加速到正常</li>
        <li><strong>Ease-out</strong> — 由正常减速到慢</li>
        <li><strong>Slow → Fast</strong> — 整段先慢后快</li>
        <li><strong>Fast → Slow</strong> — 整段先快后慢</li>
      </ul>
      <p>速度范围 0.25× – 4×，超慢动作或加速延时都覆盖。</p>

      <H3 id="editor-audio">音频精细控制</H3>
      <SpecTable
        headers={["参数", "范围", "说明"]}
        rows={[
          ["音量", "0% – 200%", "0 = 静音，200% 是原音两倍 (可能爆音)"],
          ["淡入时长", "0 – 5s", "线性渐入"],
          ["淡出时长", "0 – 5s", "线性渐出"],
          ["静音开关", "on / off", "比把音量调 0 更明确，导出后该轨完全无声"],
          ["变调 Pitch", "-12 ~ +12 半音", "+12 = 升一个八度，可做卡通效果"],
        ]}
      />
      <p>音频轨道波形可视化显示，方便对齐节拍。</p>

      <H3 id="editor-opacity">透明度与叠加</H3>
      <p>
        调节每个 clip 的不透明度 (0% – 100%)，实现叠化、残影、半透明叠加等效果。
        配合 PiP 定位可做出专业级画面合成。
      </p>

      <H3 id="editor-export">导出</H3>
      <p>
        渲染走 <strong>FFmpeg.wasm</strong>，纯浏览器，不上传任何素材到服务器。
        典型 30 秒 1080P 项目导出时间 1–3 分钟（取决于 clip 数量和效果复杂度）。
        输出 MP4 / H.264，码率自适应。
      </p>

      <Callout type="warn" title="浏览器内渲染的边界">
        <p>
          1) <strong>不支持 4K 渲染</strong>：浏览器内存上限决定的，单帧 4K 解码约 25MB，
              30s 720 帧就要 18GB —— 用 1080P 已经能覆盖 99% 投流需求。<br />
          2) <strong>长项目 (＞ 3 分钟) 建议分段导出</strong>：单次渲染时间过长容易因切换 Tab 被浏览器节流。<br />
          3) <strong>关闭其他重型 Tab</strong>：FFmpeg.wasm 占内存大，同时开多个吃内存的 Tab 可能 OOM 崩页。
        </p>
      </Callout>

      <H3 id="editor-shortcuts">编辑器快捷键</H3>
      <p>详细列表见<a href="#shortcuts">20 快捷键全表</a>。最常用：</p>
      <ul>
        <li><kbd className="help2-kbd">Space</kbd> 播放/暂停</li>
        <li><kbd className="help2-kbd">Ctrl+D</kbd> 复制选中 clip</li>
        <li><kbd className="help2-kbd">Delete</kbd> 删除选中 clip</li>
        <li><kbd className="help2-kbd">←</kbd> <kbd className="help2-kbd">→</kbd> 逐帧移动播放头</li>
        <li><kbd className="help2-kbd">Ctrl+Z</kbd> / <kbd className="help2-kbd">Ctrl+Shift+Z</kbd> 撤销/重做</li>
      </ul>
    </HelpSection>
  );
}
