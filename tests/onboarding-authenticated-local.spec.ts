import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires a separately created, isolated local Supabase stack.");
test.setTimeout(120_000);

test("real local Auth can create, review, accept, reopen, and isolate onboarding work", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "onboarding-owner");
  const stranger = await signedInContext(browser, admin, "onboarding-stranger");
  let workspaceId = "";
  try {
    const workspaceInsert = await admin.from("workspaces").insert({ kind: "customer", name: "Local onboarding customer", created_by: owner.userId }).select("id").single();
    expect(workspaceInsert.error).toBeNull();
    expect(workspaceInsert.data?.id).toEqual(expect.any(String));
    workspaceId = workspaceInsert.data!.id as string;
    const membershipInsert = await admin.from("workspace_memberships").insert({ workspace_id: workspaceId, user_id: owner.userId, role: "owner", created_by: owner.userId });
    expect(membershipInsert.error).toBeNull();

    const page = await owner.context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/workspace?workspaceId=${workspaceId}&view=onboarding`);
    await expect(page.getByRole("heading", { name: "Start an onboarding case" })).toBeVisible();
    await page.getByLabel("Case title").fill("Vendor onboarding");
    await page.getByLabel("Subject").selectOption("supplier");
    await page.getByLabel("Supplier name").fill("Acme Supplies");
    await page.getByLabel("Requirements").fill("Tax ID");
    await page.getByLabel("Field on first requirement (optional)").fill("Tax ID");
    await page.getByRole("button", { name: "Create case", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Vendor onboarding" })).toBeVisible();
    await expect(page.getByText(/Private files can be up to 2 MB/)).toBeVisible();
    // The saved case must finish its shell handoff before a new upload begins.
    await expect(page.locator('input[type="file"]')).toBeEnabled();
    const uploadResponse = page.waitForResponse((response) => response.url().endsWith("/api/onboarding/upload") && response.request().method() === "POST");
    const originalBytes = Buffer.from("%PDF-1.4\nsynthetic identity proof\n%%EOF");
    await page.locator('input[type="file"]').setInputFiles({ name: "tax-id.pdf", mimeType: "application/pdf", buffer: originalBytes });
    const uploadResult = await uploadResponse;
    expect(uploadResult.status(), await uploadResult.text()).toBe(201);
    await expect(page.getByText(/Supplied · document revision/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Automatic extraction unavailable for this file/)).toBeVisible();
    await page.getByLabel("Tax ID").fill("12-3456789");
    await page.getByRole("button", { name: "Save review", exact: true }).click();
    await page.getByRole("button", { name: "Accept this version", exact: true }).click();
    await expect(page.getByText("Complete", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Reopen private file", exact: true }).click();
    await expect(page.getByText("tax-id.pdf", { exact: true })).toBeVisible();
    const downloadLink = page.getByRole("link", { name: "Download original file", exact: true });
    await expect(downloadLink).toHaveAttribute("href", /\/api\/onboarding\/file\?workId=/);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const cases = await owner.context.request.get(`/api/onboarding?workspaceId=${workspaceId}`);
    expect(cases.status()).toBe(200);
    const listed = await cases.json();
    expect(listed.cases).toHaveLength(1);
    const caseWorkId = listed.cases[0].workId;
    const documentReference = listed.cases[0].case.requirements[0].document;
    expect(documentReference?.workId).toBeTruthy();
    const persisted = await admin.from("saved_product_work").select("product_id,resource_kind,input,payload").eq("id", caseWorkId).single();
    expect(persisted.error).toBeNull();
    expect(persisted.data?.product_id).toBe("onboarding");
    expect(persisted.data?.resource_kind).toBe("case");

    const storedDocument = await admin.from("saved_product_work").select("payload,input").eq("id", documentReference.workId).single();
    expect(storedDocument.error).toBeNull();
    expect((storedDocument.data?.input as Record<string, unknown>)?.rawBase64).toBeTruthy();
    const directMutation = await admin.from("saved_product_work")
      .update({ payload: { ...(storedDocument.data?.payload as Record<string, unknown>), text: "Rewritten evidence" } })
      .eq("id", documentReference.workId)
      .select("id");
    expect(directMutation.error?.message ?? "").toMatch(/onboarding_attachment_immutable/);
    const genericEdit = await owner.context.request.post("/api/documents", {
      data: { action: "command", workId: documentReference.workId, command: { kind: "edit", expectedRevision: documentReference.revision, title: "tax-id.txt", text: "Rewritten evidence" } },
      headers: { origin: env.app },
    });
    expect(genericEdit.status()).toBe(409);
    const reopenedAfterEdit = await owner.context.request.get(`/api/onboarding?documentWorkId=${documentReference.workId}`);
    expect(reopenedAfterEdit.status()).toBe(200);
    expect((await reopenedAfterEdit.json()).text).toBe("");

    const originalFile = await owner.context.request.get(`/api/onboarding/file?workId=${encodeURIComponent(documentReference.workId)}`);
    expect(originalFile.status()).toBe(200);
    expect(originalFile.headers()["content-type"]).toBe("application/pdf");
    expect(originalFile.headers()["content-length"]).toBe(String(originalBytes.length));
    expect(originalFile.headers()["content-disposition"]).toContain('attachment; filename="tax-id.pdf"');
    expect(await originalFile.body()).toEqual(originalBytes);

    const strangerRead = await stranger.context.request.get(`/api/onboarding?workspaceId=${workspaceId}`);
    expect(strangerRead.status()).toBe(403);
    expect(await strangerRead.text()).not.toContain("Acme Supplies");
    const strangerOriginal = await stranger.context.request.get(`/api/onboarding/file?workId=${encodeURIComponent(documentReference.workId)}`);
    expect(strangerOriginal.status()).toBe(403);
    expect(await strangerOriginal.text()).not.toContain("synthetic identity proof");
  } finally {
    if (workspaceId) await admin.from("workspaces").delete().eq("id", workspaceId);
    await owner.context.close().catch(() => {});
    await stranger.context.close().catch(() => {});
    await admin.auth.admin.deleteUser(owner.userId).catch(() => {});
    await admin.auth.admin.deleteUser(stranger.userId).catch(() => {});
  }
});
