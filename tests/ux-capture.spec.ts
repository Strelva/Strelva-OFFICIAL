/**
 * UX capture — screenshots every client-dashboard + admin-console surface at
 * desktop and mobile widths for the visual UX/UI audit. Run with the dev bypass
 * + dev-file fallback (no prod creds) so surfaces render fail-soft empty:
 *
 *   mv .env.local .env.local.aside
 *   SECRETS_ENC_KEY=localdummy REB_DEV_UNGATED_ACCESS=1 REB_DEV_TENANT=gldf \
 *     pnpm exec playwright test tests/ux-capture.spec.ts --project=desktop
 *   mv .env.local.aside .env.local
 *
 * Shots land in tests/ux-shots/{desktop,mobile}/. NOT a CI test — a capture tool.
 */
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(process.cwd(), "tests/ux-shots");

// [route, label] — the full surface set. Client dashboard first (the premium bar
// that matters most), then the operator console.
const SURFACES: Array<[string, string]> = [
  // --- Client dashboard (owner-facing) ---
  ["/dashboard", "dash-today"],
  ["/dashboard/chat", "dash-ask-strelva"],
  ["/dashboard/site", "dash-website"],
  ["/dashboard/content", "dash-content"],
  ["/dashboard/assets", "dash-assets"],
  ["/dashboard/history", "dash-history"],
  ["/dashboard/google", "dash-google-business"],
  ["/dashboard/analytics", "dash-analytics"],
  ["/dashboard/reports", "dash-reports"],
  ["/dashboard/reviews", "dash-reviews"],
  ["/dashboard/settings", "dash-settings"],
  ["/dashboard/health", "dash-health"],
  ["/dashboard/integrations", "dash-integrations"],
  ["/dashboard/store", "dash-store"],
  ["/dashboard/roster", "dash-roster"],
  ["/dashboard/schedule", "dash-schedule"],
  ["/dashboard/members", "dash-members"],
  ["/dashboard/leads", "dash-leads"],
  ["/dashboard/review", "dash-needs-you"],
  // --- Operator / admin console ---
  ["/admin", "admin-overview"],
  ["/admin/clients", "admin-clients"],
  // rhm-innovations exists in dev-tenants.json; gldf did not, so this shot 404'd
  // and left the richest admin surface (the client cockpit) unaudited.
  ["/admin/clients/rhm-innovations", "admin-client-detail"],
  ["/admin/leads", "admin-leads"],
  ["/admin/analytics", "admin-analytics"],
  ["/admin/actions", "admin-actions"],
  ["/admin/drafts", "admin-drafts"],
  ["/admin/digests", "admin-digests"],
  ["/admin/ops", "admin-ops"],
  ["/admin/audit", "admin-audit"],
  ["/admin/onboard", "admin-onboard"],
  ["/admin/pay-links", "admin-pay-links"],
];

// Tall viewports so an inner-scroll dashboard exposes more than one fold in a
// single shot (the client dashboard scrolls inside a container — a plain
// fullPage misses below-the-fold, so we use a tall window instead).
const VIEWPORTS = {
  desktop: { width: 1440, height: 2200 },
  mobile: { width: 390, height: 1800 },
};

for (const [device, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`ux-capture ${device}`, () => {
    test.use({ viewport });
    for (const [path, label] of SURFACES) {
      test(`${device} ${label}`, async ({ page }) => {
        mkdirSync(`${OUT}/${device}`, { recursive: true });
        const res = await page.goto(path, { waitUntil: "networkidle" }).catch(() => null);
        // Let animations/transitions settle.
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${OUT}/${device}/${label}.png` });
        // Record the status so a crash/500 is visible in the run log, but never
        // fail the capture — we want the screenshot regardless.
        console.log(`[capture] ${device} ${path} -> ${res?.status() ?? "no-response"}`);
        expect(true).toBe(true);
      });
    }
  });
}
