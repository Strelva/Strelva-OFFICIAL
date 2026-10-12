import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminClient, cleanup, journeyEnvironment, makeOperator, noHorizontalOverflow, person } from "./support/journeys";

// The operator works /admin/queue on real local Auth and Postgres: an owner's
// request for Strelva shows up, the operator takes it, then closes it with
// minutes logged against the business. Take, close and minutes are separate
// records; each is read back from the database, not from the page.
test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and Postgres (see docs/operations/testing-and-ci.md).");
test.beforeAll(() => { journeyEnvironment(); });
test.setTimeout(240_000);

for (const width of [1440, 390]) {
  test(`operator takes a request from /admin/queue and closes it with minutes at ${width}px`, async ({ browser }, testInfo) => {
    journeyEnvironment();
    const admin = adminClient();
    const owner = await person(browser, admin, `queue-owner-${width}`);
    const operator = await person(browser, admin, `queue-operator-${width}`, { viewport: { width, height: 900 } });
    const stranger = await person(browser, admin, `queue-stranger-${width}`);
    const businessId = randomUUID();
    const outcome = `Queue journey ${width}: add our winter hours ${randomUUID().slice(0, 6)}`;
    try {
      expect((await admin.from("workspaces").insert({ id: businessId, kind: "customer", name: `Juniper Queue ${width}`, created_by: owner.userId })).error).toBeNull();
      expect((await admin.from("workspace_memberships").insert({ workspace_id: businessId, user_id: owner.userId, role: "owner", created_by: owner.userId })).error).toBeNull();

      // The owner asks Strelva for help through the real form.
      const ownerPage = await owner.context.newPage();
      await ownerPage.goto(`/workspace?workspaceId=${businessId}&view=help`);
      await ownerPage.getByLabel("What are you trying to do?", { exact: true }).fill(outcome);
      const saved = ownerPage.waitForResponse((r) => new URL(r.url()).pathname === "/api/service-requests" && r.request().method() === "POST");
      await ownerPage.getByRole("button", { name: "Save request", exact: true }).click();
      const savedResponse = await saved;
      expect(savedResponse.status(), await savedResponse.text()).toBe(200);
      const requestId = (await savedResponse.json()).request.id as string;
      await ownerPage.close();

      // Not an operator: the queue never renders.
      const denied = await stranger.context.newPage();
      await denied.goto("/admin/queue");
      await expect(denied.getByRole("heading", { name: "Queue", level: 1 })).toHaveCount(0);
      await denied.close();

      await makeOperator(admin, operator);
      const page = await operator.context.newPage();
      page.setDefaultTimeout(30_000);
      await page.goto("/admin/queue");
      await expect(page.getByRole("heading", { name: "Queue", level: 1 })).toBeVisible();
      const row = page.locator("li").filter({ hasText: outcome }).first();
      await expect(row).toBeVisible();

      // Take it.
      const take = row.getByRole("button", { name: "Take", exact: true });
      await take.focus();
      await expect(take).toBeFocused();
      await take.click();
      await expect(page.getByRole("status").filter({ hasText: "Taken." })).toBeVisible();
      await expect(row).toContainText("Taken by you");

      const marks = async () => {
        const context = await admin.rpc("read_operator_queue_context", { p_user_id: operator.userId, p_verified_email: operator.email });
        expect(context.error).toBeNull();
        return ((context.data as { marks: Array<Record<string, unknown>> }).marks ?? []).find((mark) => mark.sourceRef === requestId) ?? null;
      };
      expect(await marks()).toMatchObject({ assigneeUserId: operator.userId, closedState: null });

      // Close it with minutes.
      await row.getByRole("button", { name: "Close", exact: true }).click();
      const form = page.getByRole("form", { name: `Close ${outcome}` });
      await form.getByLabel("Reason").fill("Added the winter hours");
      await form.getByLabel("Minutes on this?").fill("12");
      await expect(form.getByLabel("Log minutes")).toBeChecked();
      await form.getByRole("button", { name: "Close item" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Closed. Logged 12 minutes." })).toBeVisible();
      await noHorizontalOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`queue-closed-${width}.png`), fullPage: true });

      expect(await marks()).toMatchObject({ closedState: "done", closedReason: "Added the winter hours" });
      const effort = await admin.rpc("read_business_effort", { p_user_id: operator.userId, p_verified_email: operator.email, p_from: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10), p_business_id: businessId });
      expect(effort.error).toBeNull();
      const entries = effort.data as Array<{ minutes: number; note: string | null }>;
      expect(entries).toEqual([expect.objectContaining({ minutes: 12, note: expect.stringContaining("Queue:") })]);

      // Closed items leave the open list; the close survives a reload.
      await page.reload();
      await expect(page.locator("li").filter({ hasText: outcome }).getByRole("button", { name: "Take", exact: true })).toHaveCount(0);
    } finally {
      await cleanup(admin, { workspaceIds: [businessId], people: [owner, operator, stranger] });
    }
  });
}
