import { expect, test } from "@playwright/test";
import { z } from "zod";
import { homeFinderBindingSchema, homeFinderSearchResultSchema } from "@/products/home-finder/contracts";
import { homeFinderProofAdmissionSchema, requireProviderProofAdmission, claimProviderDispatch, loadProviderOwnerState, verifyProviderOwner, assertProviderReporter, verifyProviderWorkspaceOwner, assertProviderApprovalWindow } from "./support/provider-harness-admission";

// Licensed content and buyer contact data must not enter default trace/video artifacts.
test.use({ trace: "off", video: "off", screenshot: "off" });
test.setTimeout(300_000);
test.describe.configure({ retries: 0 });
test("authorized nonproduction Home Finder proves licensed client search and one consented delivery", async ({ browser }, info) => {
  assertProviderReporter(info.config);
  const scope = requireProviderProofAdmission("home-finder", homeFinderProofAdmissionSchema);
  const owner = await browser.newContext({ baseURL: scope.appOrigin, storageState: loadProviderOwnerState(scope.ownerAuthStatePath) });
  let buyer: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  let claim: ReturnType<typeof claimProviderDispatch> | undefined;
  try {
    await verifyProviderOwner(owner, scope);
    buyer = await browser.newContext();
    const response = await owner.request.get(`/api/workspace/home-finder?workspaceId=${scope.workspaceId}`);
    expect(response.status()).toBe(200);
    const view = z.object({ bindings: z.array(homeFinderBindingSchema.passthrough()) }).parse(await response.json());
    const binding = view.bindings.find(value => value.id === scope.bindingId);
    expect(binding).toBeDefined();
    expect(Boolean(binding && binding.workspaceId === scope.workspaceId && binding.externalInstallationId === scope.externalInstallationId
      && binding.licenseReference === scope.licenseReference && binding.approvedOrigin === new URL(scope.clientUrl).origin
      && binding.status === "active" && binding.lifecycle === "live" && binding.runtimeAllowed)).toBe(true);

    expect(Date.parse(binding!.licenseExpiresAt)).toBeGreaterThan(Date.now());
    const page = await buyer.newPage();
    // Real approved client iframe and browser referrer/entry handshake. No route fulfillment or token fabrication.
    await page.goto(scope.clientUrl);
    const frame = page.frameLocator(`iframe[src^="${scope.appOrigin}/home-finder/${scope.bindingId}"]`);
    await frame.getByLabel("City, area or address", { exact: true }).fill(scope.searchQuery);
    const searched = page.waitForResponse(r => new URL(r.url()).pathname === `/api/home-finder/${scope.bindingId}`
      && r.request().method() === "GET" && !new URL(r.url()).searchParams.has("renew"));
    await frame.getByRole("button", { name: "Search homes", exact: true }).click();
    const searchResponse = await searched; expect(searchResponse.status()).toBe(200);
    const search = homeFinderSearchResultSchema.parse(await searchResponse.json());
    expect(search.source.mode === "live" && search.source.isLive && search.source.name === binding!.sourceName).toBe(true);
    expect(search.count).toBe(search.listings.length);
    const listing = search.listings.find(value => value.id === scope.listingId);
    expect(Boolean(listing), "The authorized currently displayable listing must be present").toBe(true);
    await frame.getByRole("button", { name: `Ask about ${listing!.address.line}`, exact: true }).click();
    await frame.getByLabel("Your name", { exact: true }).fill(scope.buyer.name);
    await frame.getByLabel("Email", { exact: true }).fill(scope.buyer.email);
    await frame.getByRole("checkbox").check();
    // Permanently burn this approval/target before clicking. CLI repeat/retry or a
    // crash after a dispatch cannot send another inquiry under the same claim.
    claim = claimProviderDispatch(scope, scope.bindingId);
    let observedRequestId: string | undefined;
    let requestRecordFailed = false;
    page.on("request", requestEvent => {
      if (new URL(requestEvent.url()).pathname !== `/api/home-finder/${scope.bindingId}` || requestEvent.method() !== "POST") return;
      try {
        const parsed = z.object({ submissionId: z.string().uuid() }).safeParse(requestEvent.postDataJSON());
        if (!parsed.success || observedRequestId) throw new Error("Unexpected request");
        observedRequestId = parsed.data.submissionId;
        claim!.recordRequest(observedRequestId); // request event, before response observation
      } catch { requestRecordFailed = true; }
    });
    await verifyProviderWorkspaceOwner(owner, scope);
    assertProviderApprovalWindow(scope); // last synchronous check before the effect
    const [submitted] = await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === `/api/home-finder/${scope.bindingId}` && r.request().method() === "POST"),
      frame.getByRole("button", { name: "Send inquiry", exact: true }).click(),
    ]);
    const request = z.object({ submissionId: z.string().uuid(), consent: z.literal(true), listing: z.object({ id: z.string() }).passthrough(), buyer: z.object({ name: z.string(), email: z.string() }).passthrough() }).passthrough().parse(submitted.request().postDataJSON());
    expect(!requestRecordFailed && observedRequestId === request.submissionId).toBe(true);
    expect(request.listing.id === scope.listingId && request.buyer.name === scope.buyer.name && request.buyer.email === scope.buyer.email).toBe(true);
    // Preserve the one real request ID even if delivery is uncertain. Never generate or dispatch a retry.
    await info.attach("home-finder-provider-request", { contentType: "application/json", body: JSON.stringify({
      environment: "nonproduction", bindingId: scope.bindingId,
      requestId: request.submissionId, fullReleaseQualified: false }) });
    expect([200, 202]).toContain(submitted.status());
    const receipt = z.object({ requestId: z.string().uuid(), reference: z.string().min(1) }).passthrough().parse(await submitted.json());
    expect(receipt.requestId).toBe(request.submissionId);
    await expect.poll(async () => {
      const read = page.waitForResponse(r => new URL(r.url()).pathname === `/api/home-finder/${scope.bindingId}` && new URL(r.url()).searchParams.has("receipt"));
      await frame.getByRole("button", { name: "Check delivery receipt", exact: true }).click();
      const received = await read; expect(received.status()).toBe(200);
      const detail = z.object({ installationId: z.string(), reference: z.string(), state: z.string() }).passthrough().parse(await received.json());
      expect(detail.installationId === scope.externalInstallationId && detail.reference === receipt.reference).toBe(true);
      return detail.state;
    }, { timeout: 120_000, intervals: [1000, 3000, 5000] }).toBe("delivered");
  } catch { throw new Error("Home Finder provider proof failed/held; inspect private dispatch journal and operator evidence. Details withheld."); }
  finally { claim?.close(); await owner.close(); await buyer?.close(); }
});
