import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and Postgres.");
test.setTimeout(120_000);

test("a browser-held public brief survives Auth, requires an explicit destination, and stays private after import", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "continuation-owner");
  const other = await signedInContext(browser, admin, "continuation-other");
  const anonymous = await browser.newContext({ baseURL: env.app });
  const continuationId = randomUUID();
  const privateRequest = `Private continuation request ${continuationId}`;
  const privateTitle = `Private continuation title ${continuationId}`;

  try {
    // The real public intake writes only an encrypted, browser-session cookie.
    // Its response and location contain no private request content.
    const intake = await anonymous.request.post("/api/public-continuation", {
      headers: { origin: env.app },
      data: {
        version: 1,
        id: continuationId,
        businessName: "Unverified public business context",
        request: privateRequest,
        result: "A private working brief is available after account confirmation.",
        resultTitle: privateTitle,
        scope: "Prepared text and file names only.",
        review: true,
        fileNames: ["local-reference.pdf"],
      },
    });
    expect(intake.status(), await intake.text()).toBe(200);
    const intakeBody = await intake.json() as { location: string };
    expect(intakeBody.location).toBe("/sign-in?next=%2Fworkspace%2Faccount%3Fcontinue%3Dpublic");
    expect(JSON.stringify(intakeBody)).not.toContain(privateRequest);
    expect(intakeBody.location).not.toContain(privateTitle);

    const anonymousPage = await anonymous.newPage();
    await anonymousPage.goto("/workspace/account?continue=public");
    await expect(anonymousPage).toHaveURL(/\/sign-in\?next=%2Fworkspace%2Faccount%3Fcontinue%3Dpublic$/);

    const continuationCookies = (await anonymous.cookies()).filter(cookie => cookie.name === "strelva_public_continuation");
    expect(continuationCookies).toHaveLength(1);
    expect(continuationCookies[0]?.httpOnly).toBe(true);
    expect(continuationCookies[0]?.value).not.toContain(privateRequest);

    // signedInContext uses the real local Auth service. Copying the anonymous
    // continuation cookie models the same browser returning from Auth; no
    // workspace is pre-seeded for this new identity.
    await owner.context.addCookies(continuationCookies);
    const ownerPage = await owner.context.newPage();
    await ownerPage.goto("/workspace/account?continue=public");
    const continuationRegion = ownerPage.getByRole("region", { name: new RegExp(privateTitle) });
    await expect(continuationRegion.getByText(privateRequest, { exact: true })).toBeVisible();
    await expect(continuationRegion.getByText(owner.email, { exact: true })).toBeVisible();
    const destination = ownerPage.getByLabel("Save to", { exact: true });
    await expect(destination).toHaveCount(1);
    await expect(destination.locator("option")).toHaveCount(1);
    await expect(destination.locator("option")).toContainText(["personal"]);

    const personalWorkspaceId = await destination.inputValue();
    expect(personalWorkspaceId).toMatch(/^[0-9a-f-]{36}$/);
    const createdWorkspace = await admin.from("workspaces").select("kind,created_by").eq("id", personalWorkspaceId).single();
    expect(createdWorkspace.error).toBeNull();
    expect(createdWorkspace.data).toMatchObject({ kind: "personal", created_by: owner.userId });

    const importedResponse = ownerPage.waitForResponse(response => response.url().endsWith("/api/public-continuation/import") && response.request().method() === "POST");
    await ownerPage.getByRole("button", { name: "Save private brief", exact: true }).click();
    const importedHttpResponse = await importedResponse;
    if (importedHttpResponse.status() !== 201) {
      throw new Error(await importedHttpResponse.text());
    }
    await expect(ownerPage).toHaveURL(new RegExp(`/workspace\\?workspaceId=${personalWorkspaceId}.*view=document`));

    const imported = await admin.from("public_continuation_imports")
      .select("work_id,workspace_id,imported_by").eq("continuation_id", continuationId).single();
    expect(imported.error).toBeNull();
    expect(imported.data).toMatchObject({ workspace_id: personalWorkspaceId, imported_by: owner.userId });
    const workId = imported.data!.work_id as string;
    const saved = await admin.from("saved_product_work").select("product_id,resource_kind,payload").eq("id", workId).single();
    expect(saved.error).toBeNull();
    expect(saved.data).toMatchObject({ product_id: "documents", resource_kind: "document" });
    expect(JSON.stringify(saved.data?.payload)).toContain(privateRequest);
    expect(JSON.stringify(saved.data?.payload)).toContain("No file contents were uploaded");

    // A reload resolves the exact prior import instead of creating a second
    // work item when the first response or navigation was lost.
    await ownerPage.goto("/workspace/account?continue=public");
    await expect(ownerPage.getByText("Public session saved", { exact: true })).toBeVisible();
    const savedLink = ownerPage.getByRole("link", { name: "Open saved brief", exact: true });
    await expect(savedLink).toHaveAttribute("href", `/workspace?workspaceId=${personalWorkspaceId}&work=${workId}&view=document`);
    await ownerPage.reload();
    await expect(savedLink).toHaveAttribute("href", `/workspace?workspaceId=${personalWorkspaceId}&work=${workId}&view=document`);
    const repeats = await admin.from("public_continuation_imports").select("work_id").eq("continuation_id", continuationId);
    expect(repeats.error).toBeNull();
    expect(repeats.data).toEqual([{ work_id: workId }]);

    // The same retained cookie may remain in a shared browser profile. A
    // different confirmed account must not learn even the request title.
    await other.context.addCookies(continuationCookies);
    const otherPage = await other.context.newPage();
    await otherPage.goto("/workspace/account?continue=public");
    await expect(otherPage.getByText("Public session unavailable", { exact: true })).toBeVisible();
    await expect(otherPage.getByText(privateRequest, { exact: true })).toHaveCount(0);
    await expect(otherPage.getByText(privateTitle, { exact: true })).toHaveCount(0);

    // Revocation is rechecked before idempotent replay and before resolving
    // the saved destination.
    expect((await admin.from("workspace_memberships").delete().eq("workspace_id", personalWorkspaceId).eq("user_id", owner.userId)).error).toBeNull();
    const replay = await owner.context.request.post("/api/public-continuation/import", {
      headers: { origin: env.app },
      data: { workspaceId: personalWorkspaceId },
    });
    expect(replay.status(), await replay.text()).toBe(403);
    await ownerPage.goto("/workspace/account?continue=public");
    await expect(ownerPage.getByText("Public session unavailable", { exact: true })).toBeVisible();
    await expect(ownerPage.getByText(privateRequest, { exact: true })).toHaveCount(0);
  } finally {
    await Promise.allSettled([anonymous.close(), owner.context.close(), other.context.close()]);
  }
});
