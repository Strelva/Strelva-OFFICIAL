/**
 * What /global-error shows when the root layout itself failed. It can't rely
 * on the app's stylesheets or fonts, so the XA look is written out literally:
 * paper, Pebble on the page ground (no disc) for bad news, one ink pill. Nothing from the error
 * (message, digest) is shown. Pure markup so the preview can render it too.
 */
const ink = "#161715";
const font = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";

export function GlobalErrorBody() {
  return <main style={{ boxSizing: "border-box", display: "flex", minHeight: "100dvh", flexDirection: "column", justifyContent: "center", maxWidth: 560, padding: "48px 24px", margin: "0 auto", color: ink, fontFamily: font }}>
    <img src="/xa/pose-fixing.webp" alt="" width={220} height={120} style={{ display: "block", width: 220, height: 120, margin: "0 0 16px -20px", objectFit: "contain" }} />
    <h1 style={{ margin: 0, fontSize: 32, lineHeight: "38px", fontWeight: 600, letterSpacing: "-0.6px" }}>
      Strelva couldn’t load. <span style={{ display: "block", color: "#81847d" }}>The error was reported. Nothing was sent or changed by it.</span>
    </h1>
    <p style={{ margin: "24px 0 0" }}>
      {/* A full document load on purpose: the root layout itself failed, so client navigation can't be trusted. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" style={{ display: "inline-flex", alignItems: "center", minHeight: 48, padding: "0 24px", borderRadius: 999, background: ink, color: "#ffffff", fontSize: 16, fontWeight: 600, textDecoration: "none" }}>Reload Strelva</a>
    </p>
  </main>;
}

export const GLOBAL_ERROR_BACKGROUND = "#faf9f6";
