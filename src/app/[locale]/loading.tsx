import "@/styles/frame.css";

/**
 * Next.js Instant Loading UI — shown immediately when navigating between pages.
 * This eliminates the "frozen" feeling during dev-mode compilation (1-1.5s)
 * and production RSC payload fetches.
 */
export default function Loading() {
  return (
    <div className="app" style={{ minHeight: "100vh" }}>
      <header className="chrome">
        <div className="left">
          <div className="logo" style={{ opacity: 0.5 }}>
            Frame<span style={{ color: "var(--accent)" }}>/</span>0
          </div>
        </div>
        <nav id="nav" />
        <div className="right" />
      </header>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "60vh",
          opacity: 0.4,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            border: "2px solid var(--accent)",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.6s linear infinite",
          }}
        />
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
