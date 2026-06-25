import { HelpSection, H3 } from "../HelpSection";
import { KbdGrid } from "../ui/Kbd";

export function Sec20Shortcuts() {
  return (
    <HelpSection id="shortcuts" no="20" title="快捷键全表" group="运维参考">
      <p className="lead">
        Frame/0 全部 30+ 快捷键。覆盖工坊、导演台、剪辑、对比、档案。
        Mac 上 <strong>Ctrl</strong> 改为 <strong>⌘</strong>，本表沿用 Ctrl 称呼。
      </p>

      <H3 id="shortcuts-global">全局（所有页面）</H3>
      <KbdGrid items={[
        { keys: "?", label: "打开本帮助页" },
        { keys: "Cmd+/", label: "打开/关闭设置弹窗" },
        { keys: "Cmd+K", label: "命令面板 (Command Palette)" },
        { keys: "Esc", label: "取消选中 / 关闭弹窗 / 关闭 Lightbox" },
        { keys: "Cmd+Z", label: "撤销" },
        { keys: "Cmd+Shift+Z", label: "重做" },
      ]} />

      <H3 id="shortcuts-studio">工坊 Studio</H3>
      <KbdGrid items={[
        { keys: "Ctrl+Enter", label: "提交生成任务" },
        { keys: "Cmd+S", label: "保存当前 prompt 草稿" },
        { keys: "Tab", label: "切换 T2V / I2V / R2V" },
        { keys: "Shift+Tab", label: "反向切换模式" },
        { keys: "/", label: "聚焦到 prompt 输入框" },
        { keys: "Cmd+Shift+M", label: "切换模型选择器" },
        { keys: "Cmd+Shift+F", label: "聚焦到搜索框（任务列表）" },
      ]} />

      <H3 id="shortcuts-director">导演台 R2V</H3>
      <KbdGrid items={[
        { keys: "Cmd+Shift+D", label: "打开/关闭导演台抽屉" },
        { keys: "1 / 2 / 3", label: "Card 1 / Card 2 / Card 3 步骤切换" },
        { keys: "Cmd+Shift+S", label: "保存项目到磁盘" },
        { keys: "Cmd+Shift+N", label: "新建项目" },
        { keys: "Cmd+Shift+C", label: "复制 /r2v <id> 命令到剪贴板" },
        { keys: "M", label: "切换 单镜大片 / 批量短片" },
      ]} />

      <H3 id="shortcuts-editor">剪辑 Editor</H3>
      <KbdGrid items={[
        { keys: "Space", label: "播放 / 暂停" },
        { keys: "K", label: "暂停（同 Space，FCP 风格）" },
        { keys: "J / L", label: "倒带 / 快进" },
        { keys: "←", label: "向前 1 帧" },
        { keys: "→", label: "向后 1 帧" },
        { keys: "Shift+←", label: "向前 5 帧" },
        { keys: "Shift+→", label: "向后 5 帧" },
        { keys: "Home", label: "跳到时间线开头" },
        { keys: "End", label: "跳到时间线末尾" },
        { keys: "Ctrl+D", label: "复制选中 clip" },
        { keys: "Delete", label: "删除选中 clip" },
        { keys: "Backspace", label: "删除选中 clip（同 Delete）" },
        { keys: "S", label: "在播放头位置切割 clip" },
        { keys: "M", label: "静音/取消静音选中音频 clip" },
        { keys: "+", label: "时间线放大" },
        { keys: "-", label: "时间线缩小" },
        { keys: "Cmd+E", label: "导出当前项目" },
      ]} />

      <H3 id="shortcuts-archive">档案 Archive</H3>
      <KbdGrid items={[
        { keys: "G", label: "切换 网格 / 编辑式 / 胶片条" },
        { keys: "A", label: "全选当前过滤结果" },
        { keys: "Esc", label: "清除选择" },
        { keys: "Enter", label: "打开选中作品大图预览" },
        { keys: "C", label: "送到对比台（如选中 ≥2 个）" },
        { keys: "E", label: "送到剪辑器（如选中 1 个）" },
        { keys: "R", label: "重新生成（保留参数）" },
        { keys: "D", label: "删除选中作品" },
      ]} />

      <H3 id="shortcuts-compare">对比台 Compare</H3>
      <KbdGrid items={[
        { keys: "Space", label: "所有视频同步播放/暂停" },
        { keys: "B", label: "切换 Before/After 滑动模式" },
        { keys: "N", label: "切换网格模式" },
        { keys: "[", label: "Before/After 中线向左移" },
        { keys: "]", label: "Before/After 中线向右移" },
      ]} />
    </HelpSection>
  );
}
