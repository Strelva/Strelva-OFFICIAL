import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";

export const metadata = { title: "Harbor Dental (fictional)", robots: { index: false, follow: false } };

/**
 * A fictional Harbor Dental homepage for the site editor's preview frame, so
 * the legacy dashboard preview never loads a real website.
 */
export default function HarborDentalFixtureSite() {
  if (!strelvaUiPreviewEnabled()) notFound();
  return <main style={{ minHeight: "100vh", background: "#ffffff", color: "#16202a", fontFamily: "var(--font-workspace, system-ui), system-ui, sans-serif", padding: "28px 48px" }}>
    <nav style={{ display: "flex", alignItems: "center", gap: 28, fontSize: 15 }}>
      <strong style={{ color: "#1f4e5f", fontSize: 17, marginRight: "auto" }}>Harbor Dental</strong>
      <span>Services</span><span>Insurance</span><span>About</span><span>Contact</span>
      <span style={{ background: "#1f4e5f", color: "#fff", borderRadius: 999, padding: "8px 16px", fontWeight: 600 }}>Book a visit</span>
    </nav>
    <section data-section="hero" style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 40, marginTop: 56, alignItems: "start" }}>
      <div>
        <h1 style={{ fontSize: 46, lineHeight: 1.08, margin: 0, color: "#16303a" }}>Gentle family dentistry on Elmwood.</h1>
        <p style={{ fontSize: 17, lineHeight: 1.5, color: "#4a5560", maxWidth: 440 }}>Cleanings, checkups and same-week emergency visits for kids and adults.</p>
        <p style={{ fontSize: 15, color: "#16202a" }}>Mon to Fri 8 to 5 · Sat 9 to 1 · 1180 Elmwood Ave, Buffalo</p>
      </div>
      <img src="/xa/photo-dentist.webp" alt="Dr. Lin with a patient" style={{ width: 300, borderRadius: 16 }} />
    </section>
    <section data-section="services" style={{ marginTop: 48, borderTop: "1px solid #e6e5e0", paddingTop: 20, fontSize: 15, color: "#4a5560" }}>
      Insurance we accept: Delta Dental · Cigna · MetLife
    </section>
  </main>;
}
