import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";

export const metadata = { title: "Harbor Dental (fictional)", robots: { index: false, follow: false } };

/**
 * A fictional Harbor Dental homepage for the site editor's preview frame, so
 * the legacy dashboard preview never loads a real website.
 */
export default function HarborDentalFixtureSite() {
  if (!strelvaUiPreviewEnabled()) notFound();
  // A real small-business page is responsive; the fixture is too, so the
  // Phone frame shows the phone layout rather than a cropped desktop.
  const css = `
    .hd { min-height: 100vh; background: #fff; color: #16202a; font-family: var(--font-workspace, system-ui), system-ui, sans-serif; padding: 28px 48px; }
    .hd nav { display: flex; align-items: center; gap: 28px; font-size: 15px; }
    .hd .brand { color: #1f4e5f; font-size: 17px; margin-right: auto; }
    .hd .book { background: #1f4e5f; color: #fff; border-radius: 999px; padding: 8px 16px; font-weight: 600; }
    .hd .hero { display: grid; grid-template-columns: 1fr 300px; gap: 40px; margin-top: 56px; align-items: start; }
    .hd h1 { font-size: 46px; line-height: 1.08; margin: 0; color: #16303a; }
    .hd .lede { font-size: 17px; line-height: 1.5; color: #4a5560; max-width: 440px; }
    .hd .facts { font-size: 15px; }
    .hd img { width: 100%; max-width: 300px; border-radius: 16px; }
    .hd .ins { margin-top: 48px; border-top: 1px solid #e6e5e0; padding-top: 20px; font-size: 15px; color: #4a5560; }
    @media (max-width: 640px) {
      .hd { padding: 20px; }
      .hd nav .link { display: none; }
      .hd .hero { grid-template-columns: 1fr; gap: 24px; margin-top: 32px; }
      .hd h1 { font-size: 34px; }
      .hd img { max-width: none; }
    }`;
  return <main className="hd">
    <style>{css}</style>
    <nav>
      <strong className="brand">Harbor Dental</strong>
      <span className="link">Services</span><span className="link">Insurance</span><span className="link">About</span><span className="link">Contact</span>
      <span className="book">Book a visit</span>
    </nav>
    <section data-section="hero" className="hero">
      <div>
        <h1>Gentle family dentistry on Elmwood.</h1>
        <p className="lede">Cleanings, checkups and same-week emergency visits for kids and adults.</p>
        <p className="facts">Mon to Fri 8 to 5 · Sat 9 to 1 · 1180 Elmwood Ave, Buffalo</p>
      </div>
      <img src="/xa/photo-dentist.webp" alt="Dr. Lin with a patient" />
    </section>
    <section data-section="services" className="ins">Insurance we accept: Delta Dental · Cigna · MetLife</section>
  </main>;
}
