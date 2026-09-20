import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(
  process.env.STRELVA_LOCAL_AUTH_PROOF !== "1" || process.env.STRELVA_CUSTOM_APPLICATION_JOURNEY !== "1",
  "Requires the isolated local Auth stack, Docker build image, and the explicit custom application journey flag.",
);
test.setTimeout(240_000);

async function post(request: APIRequestContext, path: string, body: unknown, expectedStatus = 200) {
  const response = await request.post(path, {
    headers: { origin: localEnvironment().app, "sec-fetch-site": "same-origin" },
    data: body,
  });
  expect(response.status(), await response.text()).toBe(expectedStatus);
  return response.json();
}

async function manage(request: APIRequestContext, workId: string, action: string, input?: unknown, expectedStatus = 200) {
  return post(request, `/api/custom-applications/${workId}/manage`, { action, ...(input === undefined ? {} : { input }) }, expectedStatus);
}

async function closeContext(context: BrowserContext | undefined) {
  await context?.close().catch(() => {});
}

const v1Source = `import { writeFile } from "node:fs/promises";

await writeFile("/output/index.html", \`<main style="max-width:32rem;margin:2rem auto;padding:1rem;font:1rem system-ui">
  <h2>Local repair intake</h2>
  <p>Use this form to count a local request.</p>
  <button id="add" type="button">Add request</button>
  <output id="count" aria-live="polite">Requests: 0</output>
  <script>
    let count = 0;
    document.getElementById("add").addEventListener("click", () => {
      count += 1;
      document.getElementById("count").textContent = "Requests: " + count;
    });
  </script>
</main>\`);`;

const v2Source = v1Source.replace("Requests: 0", "Requests: 10").replace("Local repair intake", "Local repair intake v2");

test("local Auth recipient uses its reviewed release while candidate changes and rollback preserves the pinned grant", async ({ browser }, testInfo) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "custom-application-owner");
  const recipient = await signedInContext(browser, admin, "custom-application-recipient");
  let workId: string | undefined;

  try {
    const workspace = await owner.context.request.get("/api/workspace");
    expect(workspace.status(), await workspace.text()).toBe(200);
    const { workspaceId } = await workspace.json() as { workspaceId: string };

    const created = await post(owner.context.request, "/api/custom-applications", {
      workspaceId,
      application: {
        title: "Local repair intake",
        files: { "build.mjs": v1Source },
        budget: { maxAuthorizedCents: 0, estimateCents: 0 },
      },
    }, 201);
    const first = created.application as {
      workId: string;
      candidate: { revision: number; version: number; artifact: null };
      budget: { status: string; jobId: string };
      status: string;
    };
    workId = first.workId;
    expect(first).toMatchObject({ status: "draft", candidate: { revision: 0, version: 1, artifact: null }, budget: { status: "accepted" } });

    await manage(owner.context.request, workId, "release", { expectedCandidateRevision: 0, expectedReleaseVersion: null }, 409);
    const built = await manage(owner.context.request, workId, "build", { expectedCandidateRevision: 0 });
    const artifact = built.application.candidate.artifact as { artifactDigest: string; applicationVersion: number; state: string };
    expect(artifact).toMatchObject({ applicationVersion: 1, state: "built" });
    expect(artifact.artifactDigest).toMatch(/^[a-f0-9]{64}$/);

    const checks = [
      { id: "build", passed: true, evidence: `Restricted receipt returned ${artifact.artifactDigest}.` },
      { id: "desktop", passed: true, evidence: "Recipient frame rendered and button interaction was observed at desktop width." },
      { id: "mobile", passed: true, evidence: "Recipient frame stayed within the mobile viewport and remained usable." },
      { id: "keyboard", passed: true, evidence: "The recipient button received focus and activated with Enter." },
    ] as const;
    const reviewed = await manage(owner.context.request, workId, "review", {
      expectedCandidateRevision: 0,
      artifactDigest: artifact.artifactDigest,
      checks,
    });
    expect(reviewed.application.candidate.artifact.review).toMatchObject({ artifactDigest: artifact.artifactDigest });
    const released = await manage(owner.context.request, workId, "release", { expectedCandidateRevision: 0, expectedReleaseVersion: null });
    expect(released.application).toMatchObject({ status: "released", currentReleaseVersion: 1, releases: [{ version: 1, artifactDigest: artifact.artifactDigest }] });

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const grant = await post(recipient.context.request, `/api/custom-applications/${workId}/access`, {
      recipientEmail: recipient.email,
      purpose: "Use the local repair intake during this proof.",
      expiresAt,
    }, 403);
    expect(grant).toMatchObject({ code: "custom_application_access_denied" });
    const ownerGrant = await post(owner.context.request, `/api/custom-applications/${workId}/access`, {
      recipientEmail: recipient.email,
      purpose: "Use the local repair intake during this proof.",
      expiresAt,
    }, 201);
    expect(ownerGrant).toMatchObject({ workId, releaseVersion: 1, recipientEmail: recipient.email });

    const recipientSnapshot = await recipient.context.request.get(`/api/custom-applications/${workId}`);
    expect(recipientSnapshot.status(), await recipientSnapshot.text()).toBe(200);
    const firstUse = await recipientSnapshot.json();
    expect(firstUse).toMatchObject({ releaseVersion: 1, artifactDigest: artifact.artifactDigest, html: expect.stringContaining("Local repair intake") });

    const recipientPage = await recipient.context.newPage();
    await recipientPage.goto(`/custom-applications/${workId}`, { waitUntil: "domcontentloaded" });
    await expect(recipientPage.getByRole("heading", { name: "Local repair intake", exact: true })).toBeVisible();
    const frame = recipientPage.frameLocator('iframe[title="Local repair intake released application"]');
    await expect(frame.getByRole("button", { name: "Add request", exact: true })).toBeVisible();
    await frame.getByRole("button", { name: "Add request", exact: true }).click();
    await expect(frame.getByRole("status")).toHaveText("Requests: 1");
    await frame.getByRole("button", { name: "Add request", exact: true }).focus();
    await frame.getByRole("button", { name: "Add request", exact: true }).press("Enter");
    await expect(frame.getByRole("status")).toHaveText("Requests: 2");
    await recipientPage.screenshot({ path: testInfo.outputPath("custom-application-recipient-desktop.png"), fullPage: true });
    await recipientPage.setViewportSize({ width: 390, height: 844 });
    expect(await recipientPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(frame.getByRole("button", { name: "Add request", exact: true })).toBeVisible();
    await recipientPage.screenshot({ path: testInfo.outputPath("custom-application-recipient-mobile.png"), fullPage: true });
    await recipientPage.close();

    const targetRequests: string[] = [];
    const targetServer = createServer((request, response) => {
      if (request.url) targetRequests.push(request.url);
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<main>Unexpected navigation target</main>");
    });
    await new Promise<void>((resolve, reject) => {
      targetServer.once("error", reject);
      targetServer.listen(0, "127.0.0.1", () => resolve());
    });
    const targetAddress = targetServer.address();
    if (!targetAddress || typeof targetAddress === "string") throw new Error("Navigation proof server did not expose a port");
    const targetBase = `http://127.0.0.1:${targetAddress.port}`;
    try {
      const directPage = await recipient.context.newPage();
      await directPage.goto(`/custom-applications/${workId}`, { waitUntil: "domcontentloaded" });
      const directFrame = directPage.frameLocator('iframe[title="Local repair intake released application"]');
      await expect(directFrame.getByRole("button", { name: "Add request", exact: true })).toBeVisible();
      const directTarget = `${targetBase}/direct-location`;
      await directFrame.locator("body").evaluate((body, url) => {
        const view = body.ownerDocument.defaultView;
        if (view) view.location.href = url;
      }, directTarget);
      await directPage.waitForTimeout(300);
      expect(targetRequests).toEqual([]);
      expect(directPage.url()).toContain(`/custom-applications/${workId}`);
      expect(directPage.frames().find(frame => frame !== directPage.mainFrame())?.url()).not.toBe(directTarget);
      await directPage.close();

      targetRequests.length = 0;
      const refreshPage = await recipient.context.newPage();
      await refreshPage.goto(`/custom-applications/${workId}`, { waitUntil: "domcontentloaded" });
      const refreshFrame = refreshPage.frameLocator('iframe[title="Local repair intake released application"]');
      await expect(refreshFrame.getByText("Use this form to count a local request.", { exact: true })).toBeVisible();
      const refreshTarget = `${targetBase}/meta-refresh`;
      await refreshFrame.locator("head").evaluate((head, url) => {
        const refresh = head.ownerDocument.createElement("meta");
        refresh.httpEquiv = "refresh";
        refresh.content = `0;url=${url}`;
        head.append(refresh);
      }, refreshTarget);
      await refreshPage.waitForTimeout(300);
      expect(targetRequests).toEqual([]);
      expect(refreshPage.url()).toContain(`/custom-applications/${workId}`);
      expect(refreshPage.frames().find(frame => frame !== refreshPage.mainFrame())?.url()).not.toBe(refreshTarget);
      await refreshPage.close();
    } finally {
      await new Promise<void>((resolve, reject) => targetServer.close(error => error ? reject(error) : resolve()));
    }

    const revised = await manage(owner.context.request, workId, "revise", {
      expectedCandidateRevision: 0,
      title: "Local repair intake v2",
      files: { "build.mjs": v2Source },
    });
    expect(revised.application.candidate).toMatchObject({ revision: 1, version: 2, artifact: null });
    const builtV2 = await manage(owner.context.request, workId, "build", { expectedCandidateRevision: 1 });
    const artifactV2 = builtV2.application.candidate.artifact as { artifactDigest: string; applicationVersion: number };
    expect(artifactV2).toMatchObject({ applicationVersion: 2 });
    expect(artifactV2.artifactDigest).not.toBe(artifact.artifactDigest);
    await manage(owner.context.request, workId, "review", {
      expectedCandidateRevision: 1,
      artifactDigest: artifactV2.artifactDigest,
      checks: [
        { id: "build", passed: true, evidence: `Restricted receipt returned ${artifactV2.artifactDigest}.` },
        { id: "desktop", passed: true, evidence: "The revised artifact rendered at desktop width." },
        { id: "mobile", passed: true, evidence: "The revised artifact stayed within the mobile viewport." },
        { id: "keyboard", passed: true, evidence: "The revised button activated from the keyboard path." },
      ],
    });
    const releasedV2 = await manage(owner.context.request, workId, "release", { expectedCandidateRevision: 1, expectedReleaseVersion: 1 });
    expect(releasedV2.application.currentReleaseVersion).toBe(2);

    // The recipient grant is immutable at v1 while the owner works on v2.
    const pinned = await recipient.context.request.get(`/api/custom-applications/${workId}`);
    expect(pinned.status(), await pinned.text()).toBe(200);
    expect(await pinned.json()).toMatchObject({ releaseVersion: 1, artifactDigest: artifact.artifactDigest, html: expect.stringContaining("Requests: 0") });

    const rolledBack = await manage(owner.context.request, workId, "rollback", { expectedReleaseVersion: 2, version: 1 });
    expect(rolledBack.application).toMatchObject({ status: "released", currentReleaseVersion: 1 });
    const afterRollback = await owner.context.request.get(`/api/custom-applications/${workId}/manage`);
    expect(afterRollback.status(), await afterRollback.text()).toBe(200);
    expect((await afterRollback.json()).application.currentReleaseVersion).toBe(1);

    const grants = await owner.context.request.get(`/api/custom-applications/${workId}/access`);
    expect(grants.status(), await grants.text()).toBe(200);
    const grantList = await grants.json();
    expect(grantList.grants).toHaveLength(1);
    expect(grantList.grants[0]).toMatchObject({ releaseVersion: 1, status: "active" });
  } finally {
    await closeContext(owner.context);
    await closeContext(recipient.context);
    if (workId) {
      await admin.from("custom_application_grants").delete().eq("work_id", workId);
      await admin.from("custom_application_releases").delete().eq("work_id", workId);
      await admin.from("custom_application_reviews").delete().eq("work_id", workId);
      await admin.from("custom_application_artifacts").delete().eq("work_id", workId);
      await admin.from("custom_application_states").delete().eq("work_id", workId);
      await admin.from("job_economics").delete().eq("work_id", workId);
      await admin.from("saved_product_work").delete().eq("id", workId);
    }
    await admin.auth.admin.deleteUser(owner.userId).catch(() => {});
    await admin.auth.admin.deleteUser(recipient.userId).catch(() => {});
  }
});
