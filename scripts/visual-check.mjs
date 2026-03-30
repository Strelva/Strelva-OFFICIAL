import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = "http://localhost:3000";
const OUT = "/tmp/reb-screenshots";
mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // 1. Public homepage
  console.log("1. Homepage...");
  const home = await context.newPage();
  await home.goto(BASE, { waitUntil: "networkidle" });
  await home.waitForTimeout(1000);
  await home.screenshot({ path: `${OUT}/01-home.png`, fullPage: true });
  console.log("   -> OK");

  // 2. Homepage with edit mode
  console.log("2. Homepage edit mode...");
  const homeEdit = await context.newPage();
  await homeEdit.goto(`${BASE}/?edit=true`, { waitUntil: "networkidle" });
  await homeEdit.waitForTimeout(1000);
  await homeEdit.screenshot({ path: `${OUT}/02-home-edit.png`, fullPage: true });
  console.log("   -> OK");

  // 3-9. All other pages
  for (const [name, path] of [
    ["Services", "/services"],
    ["About", "/about"],
    ["Events", "/events"],
    ["FAQ", "/faq"],
    ["Providers", "/providers"],
    ["Shop", "/shop"],
    ["Contact", "/contact"],
  ]) {
    console.log(`${name}...`);
    const p = await context.newPage();
    await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${OUT}/${name.toLowerCase()}.png`, fullPage: true });
    await p.close();
    console.log("   -> OK");
  }

  // Dashboard — use domcontentloaded, not networkidle (Clerk may redirect)
  console.log("Dashboard...");
  const dash = await context.newPage();
  try {
    await dash.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 10000 });
    await dash.waitForTimeout(2000);
    await dash.screenshot({ path: `${OUT}/dashboard.png`, fullPage: true });
    console.log("   -> OK (may show auth redirect)");
  } catch {
    console.log("   -> Skipped (auth redirect)");
  }

  // Page config API
  console.log("Page config API...");
  const api = await context.newPage();
  await api.goto(`${BASE}/api/page-config`, { waitUntil: "networkidle" });
  const apiText = await api.textContent("body");
  console.log("   -> Response:", apiText?.slice(0, 300));

  // Check data-reb-section attributes
  console.log("\n--- Edit Mode Verification ---");
  const editPage = await context.newPage();
  await editPage.goto(`${BASE}/?edit=true`, { waitUntil: "networkidle" });
  await editPage.waitForTimeout(500);

  const sections = await editPage.$$eval("[data-reb-section]", (els) =>
    els.map((el) => ({
      type: el.getAttribute("data-reb-section"),
      editable: el.getAttribute("data-reb-editable"),
      label: el.getAttribute("data-reb-label"),
    }))
  );
  console.log("Sections found:", sections.length);
  for (const s of sections) {
    console.log(`  [${s.type}] editable=${s.editable || "no"} label="${s.label}"`);
  }

  // Check data-reb-field attributes
  const fields = await editPage.$$eval("[data-reb-field]", (els) =>
    els.map((el) => ({
      field: el.getAttribute("data-reb-field"),
      tag: el.tagName,
      section: el.closest("[data-reb-section]")?.getAttribute("data-reb-section"),
    }))
  );
  console.log(`\nEditable fields found: ${fields.length}`);
  for (const f of fields) {
    console.log(`  ${f.section} -> ${f.field} (${f.tag})`);
  }

  // Check edit mode is active
  const hasEditAttr = await editPage.$eval("html", (el) => el.getAttribute("data-reb-edit"));
  console.log(`\nEdit mode active: ${hasEditAttr}`);

  // Check hover outline works (simulate hover on first section)
  if (sections.length > 0) {
    const firstSection = await editPage.$("[data-reb-section]");
    if (firstSection) {
      await firstSection.hover();
      await editPage.waitForTimeout(300);
      await editPage.screenshot({ path: `${OUT}/edit-hover.png`, fullPage: false });
      console.log("Hover screenshot saved");
    }
  }

  // Mobile viewport check
  console.log("\n--- Mobile Viewport ---");
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(BASE, { waitUntil: "networkidle" });
  await mobilePage.waitForTimeout(1000);
  await mobilePage.screenshot({ path: `${OUT}/mobile-home.png`, fullPage: true });
  console.log("Mobile homepage -> OK");

  await browser.close();
  console.log(`\nAll screenshots in ${OUT}/`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
