import { ImageResponse } from "next/og";

/** Open Graph 分享图 —— 社交平台分享链接时的预览大图（1200×630）。 */
export const alt = "Frame/0 Studio — direct films with the machine";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          background: "#1c1814",
          padding: 88,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 28,
            letterSpacing: 9,
            color: "#9a8f80",
          }}
        >
          AI VIDEO STUDIO
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 140,
            fontWeight: 700,
            color: "#f0e9dd",
            lineHeight: 1,
            marginTop: 30,
          }}
        >
          Frame
          <span style={{ color: "#d2691e" }}>/0</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 42,
            color: "#b8ab98",
            marginTop: 36,
          }}
        >
          Direct films with the machine.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 24,
            color: "#6b6256",
            marginTop: "auto",
          }}
        >
          Wan · Kling · PixVerse · HappyHorse
        </div>
      </div>
    ),
    { ...size }
  );
}
