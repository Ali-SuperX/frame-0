/** 画幅比例可视化 —— 把 16:9 / 9:16 / 1:1 画成对应形状的矩形。
 *  从 Studio.tsx 抽出共享（OmniComposer 的 ratio chip 复用）。 */
export default function RatioGlyph({
  ratio,
  base = 16,
}: {
  ratio: string;
  base?: number;
}) {
  const parts = ratio.split(":").map(Number);
  const [rw, rh] =
    parts.length === 2 && parts[0] > 0 && parts[1] > 0 ? parts : [16, 9];
  const long = Math.max(rw, rh);
  return (
    <span
      className="ratio-glyph"
      style={{
        width: Math.round((rw / long) * base),
        height: Math.round((rh / long) * base),
      }}
      aria-label={ratio}
    />
  );
}
