import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = "http://localhost:3000";
const OUT = "/tmp/reb-taste";
mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch();

  // Desktop 1440
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const pages = [
    ["home", "/"],
    ["services", "/services"],
    ["about", "/about"],
    ["events", "/events"],
    ["providers", "/providers"],
    ["faq", "/faq"],
    ["shop", "/shop"],
    ["contact", "/contact"],
  ];

  for (const [name, path] of pages) {
    const p = await desktop.newPage();
    await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(1500); // Wait for GSAP animations
    // Above fold
    await p.screenshot({ path: `${OUT}/desktop-${name}-fold.png` });
    // Full page
    await p.screenshot({ path: `${OUT}/desktop-${name}-full.png`, fullPage: true });
    await p.close();
    console.log(`desktop ${name} -> OK`);
  }

  // Mobile 390
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });

  for (const [name, path] of pages) {
    const p = await mobile.newPage();
    await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${OUT}/mobile-${name}-fold.png` });
    await p.screenshot({ path: `${OUT}/mobile-${name}-full.png`, fullPage: true });
    await p.close();
    console.log(`mobile ${name} -> OK`);
  }

  // Tablet 768
  const tablet = await browser.newContext({ viewport: { width: 768, height: 1024 } });
  for (const [name, path] of [["home", "/"], ["services", "/services"]]) {
    const p = await tablet.newPage();
    await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(1000);
    await p.screenshot({ path: `${OUT}/tablet-${name}.png`, fullPage: true });
    await p.close();
    console.log(`tablet ${name} -> OK`);
  }

  await browser.close();
  console.log(`\nAll screenshots in ${OUT}/`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
