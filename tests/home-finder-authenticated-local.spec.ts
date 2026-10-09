import { expect, test } from "@playwright/test";
import { z } from "zod";
import { homeFinderBindingSchema, homeFinderSearchResultSchema } from "@/products/home-finder/contracts";
import { homeFinderProofAdmissionSchema, requireProviderProofAdmission } from "./support/provider-harness-admission";

// Licensed content and buyer contact data must not enter default trace/video artifacts.
test.use({ trace: "off", video: "off", screenshot: "off" });
test.setTimeout(300_000);
test("authorized nonproduction Home Finder proves licensed client search and one consented delivery", async ({ browser }, info) => {
  const scope = requireProviderProofAdmission("home-finder", homeFinderProofAdmissionSchema);
  const owner = await browser.newContext({ baseURL: scope.appOrigin, storageState: scope.ownerAuthStatePath });
  const buyer = await browser.newContext();
  try {
    const response = await owner.request.get(`/api/workspace/home-finder?workspaceId=${scope.workspaceId}`);
    expect(response.status()).toBe(200);
    const view = z.object({ bindings: z.array(homeFinderBindingSchema.passthrough()) }).parse(await response.json());
    const binding = view.bindings.find(value => value.id === scope.bindingId);
    expect(binding).toBeDefined();
    expect(binding).toMatchObject({ workspaceId: scope.workspaceId, externalInstallationId: scope.externalInstallationId,
      licenseReference: scope.licenseReference, approvedOrigin: new URL(scope.clientUrl).origin,
      status: "active", lifecycle: "live", runtimeAllowed: true });
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
    expect(search.source).toMatchObject({ mode: "live", isLive: true, name: binding!.sourceName });
    expect(search.count).toBe(search.listings.length);
    const listing = search.listings.find(value => value.id === scope.listingId);
    expect(listing, "The specifically authorized, currently displayable listing must be present").toBeDefined();
    await frame.getByRole("button", { name: `Ask about ${listing!.address.line}`, exact: true }).click();
    await frame.getByLabel("Your name", { exact: true }).fill(scope.buyer.name);
    await frame.getByLabel("Email", { exact: true }).fill(scope.buyer.email);
    await frame.getByRole("checkbox").check();
    const sent = page.waitForResponse(r => new URL(r.url()).pathname === `/api/home-finder/${scope.bindingId}` && r.request().method() === "POST");
    await frame.getByRole("button", { name: "Send inquiry", exact: true }).click();
    const submitted = await sent;
    const request = z.object({ submissionId: z.string().uuid(), consent: z.literal(true), listing: z.object({ id: z.string() }).passthrough(), buyer: z.object({ name: z.string(), email: z.string() }).passthrough() }).passthrough().parse(submitted.request().postDataJSON());
    expect(request).toMatchObject({ listing: { id: scope.listingId }, buyer: { name: scope.buyer.name, email: scope.buyer.email } });
    // Preserve the one real request ID even if delivery is uncertain. Never generate or dispatch a retry.
    await info.attach("home-finder-provider-request", { contentType: "application/json", body: JSON.stringify({
      environment: "nonproduction", authorizationReference: scope.authorizationReference, bindingId: scope.bindingId,
      requestId: request.submissionId, fullReleaseQualified: false }) });
    expect([200, 202]).toContain(submitted.status());
    const receipt = z.object({ requestId: z.string().uuid(), reference: z.string().min(1) }).passthrough().parse(await submitted.json());
    expect(receipt.requestId).toBe(request.submissionId);
    await expect.poll(async () => {
      const read = page.waitForResponse(r => new URL(r.url()).pathname === `/api/home-finder/${scope.bindingId}` && new URL(r.url()).searchParams.has("receipt"));
      await frame.getByRole("button", { name: "Check delivery receipt", exact: true }).click();
      const received = await read; expect(received.status()).toBe(200);
      const detail = z.object({ installationId: z.string(), reference: z.string(), state: z.string() }).passthrough().parse(await received.json());
      expect(detail.installationId).toBe(scope.externalInstallationId); expect(detail.reference).toBe(receipt.reference);
      return detail.state;
    }, { timeout: 120_000, intervals: [1000, 3000, 5000] }).toBe("delivered");
  } finally { await owner.close(); await buyer.close(); }
});
