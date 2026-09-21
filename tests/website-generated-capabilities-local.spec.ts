import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, normalize } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "@playwright/test";

test.describe("generated website published capability runtime", () => {
  test("submits inquiry and reserves, changes, and cancels a booking against local protocol fixtures", async ({ page }) => {
    const sourceDir = mkdtempSync(join(tmpdir(), "strelva-generated-capabilities-"));
    let staticRoot = "";
    let receipt = {
      schemaVersion: 1,
      reservationId: "reservation-12345678",
      managementToken: "management-12345678",
      capabilityId: "booking-main",
      version: 4,
      provider: "outlook",
      status: "confirmed",
      title: "Consultations",
      start: "2026-10-01T13:00:00+00:00",
      end: "2026-10-01T14:00:00+00:00",
      timeZone: "America/New_York",
    };
    const schedule = {
      schemaVersion: 1,
      capabilityId: "booking-main",
      version: 4,
      name: "Consultations",
      provider: "outlook",
      timeZone: "America/New_York",
      slots: [
        { id: "slot-12345678", start: "2026-10-01T13:00:00+00:00", end: "2026-10-01T14:00:00+00:00" },
        { id: "slot-87654321", start: "2026-10-02T13:00:00+00:00", end: "2026-10-02T14:00:00+00:00" },
      ],
    };
    const inquiry = {
      schemaVersion: 1,
      capabilityId: "inquiry-main",
      version: 3,
      name: "Buyer inquiries",
      form: {
        component: "form",
        id: "buyer",
        title: "Tell us what you need",
        intro: "A person will follow up.",
        disclosure: "Strelva",
        fields: [
          { id: "name", label: "Name", kind: "text", component: "text_field", required: true },
          { id: "email", label: "Email", kind: "email", component: "email_field", required: true },
        ],
      },
    };
    const received: Array<Record<string, unknown>> = [];
    const server = createServer(async (request, response) => {
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname.startsWith("/api/v1/")) {
        let body = "";
        for await (const chunk of request) body += chunk;
        const payload = body ? JSON.parse(body) as Record<string, unknown> : null;
        const send = (value: unknown, status = 200) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(value)); };
        if (url.pathname === "/api/v1/inquiries/northstar") return send(inquiry);
        if (url.pathname === "/api/v1/leads/northstar") { received.push(payload ?? {}); return send({ ok: true }); }
        if (url.pathname === "/api/v1/bookings/northstar" && request.method === "GET") return send(schedule);
        if (url.pathname === "/api/v1/bookings/northstar/reservations" && request.method === "POST") return send({ receipt });
        if (url.pathname.endsWith("/reservations/reservation-12345678") && request.method === "PATCH") {
          const changedSlot = schedule.slots[1];
          if (!changedSlot) return send({ error: "fixture slot missing" }, 500);
          receipt = { ...receipt, start: changedSlot.start, end: changedSlot.end };
          return send({ receipt });
        }
        if (url.pathname.endsWith("/reservations/reservation-12345678") && request.method === "DELETE") {
          receipt = { ...receipt, status: "cancelled" };
          return send({ receipt });
        }
        return send({ error: "fixture route not found" }, 404);
      }
      if (!staticRoot) { response.writeHead(503); response.end("fixture is preparing"); return; }
      const relative = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
      const target = normalize(join(staticRoot, relative));
      if (!target.startsWith(staticRoot)) { response.writeHead(404); response.end(); return; }
      try {
        const content = readFileSync(target);
        response.writeHead(200, { "Content-Type": target.endsWith(".js") || target.endsWith(".mjs") ? "text/javascript" : "text/html" });
        response.end(content);
      } catch { response.writeHead(404); response.end(); }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Local capability fixture did not bind a port.");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      execFileSync("pnpm", ["exec", "tsx", "tests/support/generate-website-capability-fixture.ts", "--base-url", baseUrl, "--output", sourceDir], { cwd: process.cwd(), stdio: "pipe" });
      execFileSync(process.execPath, [join(sourceDir, "scripts/build-site.mjs")], { cwd: sourceDir, stdio: "pipe" });
      const manifest = JSON.parse(readFileSync(join(sourceDir, "artifact-manifest.json"), "utf8")) as { artifactDigest?: unknown };
      const buildReceipt = JSON.parse(readFileSync(join(sourceDir, "dist", "build-receipt.json"), "utf8")) as { artifactDigest?: unknown };
      expect(buildReceipt.artifactDigest).toBe(manifest.artifactDigest);
      staticRoot = join(sourceDir, "dist");
      await page.goto(baseUrl);
      const inquiryRoot = page.locator('[data-strelva-capability="inquiry"]');
      await expect(inquiryRoot.getByRole("heading", { name: "Tell us what you need" })).toBeVisible();
      await inquiryRoot.getByLabel("Name").fill("Avery Buyer");
      await inquiryRoot.getByLabel("Email").fill("avery@example.test");
      await inquiryRoot.getByRole("button", { name: "Send request" }).click();
      await expect(inquiryRoot.getByText("Your request has been received.")).toBeVisible();
      expect(received[0]).toMatchObject({ capabilityId: "inquiry-main", capabilityVersion: 3 });

      const bookingRoot = page.locator('[data-strelva-capability="booking"]');
      await expect(bookingRoot.getByRole("heading", { name: "Consultations" })).toBeVisible();
      await bookingRoot.getByLabel("Name").fill("Avery Buyer");
      await bookingRoot.getByLabel("Email").fill("avery@example.test");
      await bookingRoot.getByRole("button", { name: "Reserve time" }).click();
      await expect(bookingRoot.getByText("Your time is reserved.")).toBeVisible();
      await bookingRoot.getByLabel("Available time").selectOption("slot-87654321");
      await bookingRoot.getByRole("button", { name: "Change time" }).click();
      await expect(bookingRoot.getByText(/This reservation is cancelled\./)).toHaveCount(0);
      await bookingRoot.getByRole("button", { name: "Cancel reservation" }).click();
      await expect(bookingRoot.getByText("This reservation is cancelled.")).toBeVisible();
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });
});
