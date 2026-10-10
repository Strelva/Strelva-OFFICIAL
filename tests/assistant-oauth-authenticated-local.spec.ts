import { expect, test } from "@playwright/test";
import { z } from "zod";
import { localSql } from "./support/journeys";
import { assistantProviderAdmission } from "./support/money-agent-provider-contracts";
import { assertProviderReporter, parseProviderProofAdmission, requireProviderProofAdmission, loadProviderOwnerState, verifyProviderWorkspaceOwner, readPrivateJson, claimProviderDispatch } from "./support/provider-harness-admission";
test.use({ trace: "off", screenshot: "off", video: "off" });
test.setTimeout(180_000);
test.describe.configure({ retries: 0 });
test("actual provider browser consent, native renewal and owner revocation", async ({ browser }, info) => {
 assertProviderReporter(info.config);
 const scope = requireProviderProofAdmission("assistant-oauth", assistantProviderAdmission);
 const owner = await browser.newContext({ baseURL: scope.appOrigin, storageState: loadProviderOwnerState(scope.ownerAuthStatePath) });
 let claim: ReturnType<typeof claimProviderDispatch> | undefined;
 try {
  await verifyProviderWorkspaceOwner(owner, scope);
  const providerState = loadProviderOwnerState(scope.providerSessionPath);
  const providerHost = new URL(scope.providerOrigin).hostname;
  const appHost = new URL(scope.appOrigin).hostname;
  const matches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (providerHost === appHost || ["localhost", "127.0.0.1"].includes(providerHost) || providerState.cookies.some(c => {
    const domain = c.domain.replace(/^\./, ""); return !matches(providerHost, domain) || matches(appHost, domain);
  })) throw new Error("Provider cookie scope mismatch");
  await owner.addCookies(providerState.cookies);
  await verifyProviderWorkspaceOwner(owner, scope);
  const url = new URL(z.object({ authorizationUrl: z.string().url() }).strict().parse(readPrivateJson(scope.authorizationUrlPath)).authorizationUrl);
  expect(url.origin).toBe(scope.appOrigin); expect(url.pathname).toBe("/connect/authorize");
  expect(url.searchParams.get("client_id")).toBe(scope.clientId);
  expect(new URL(url.searchParams.get("redirect_uri")!).origin).toBe(scope.providerOrigin);
  expect((url.searchParams.get("scope") ?? "").split(" ").sort()).toEqual([...scope.scopes].sort());
  const count = () => localSql<number>(`select count(*) from public.assistant_connections where workspace_id=:'v1'::uuid and client_id=:'v2';`, scope.workspaceId, scope.clientId);
  expect(count()).toBe(0);
  const page = await owner.newPage(); await page.goto(url.toString());
  await expect(page.getByRole("heading", { name: `Connect ${scope.clientName}`, exact: true })).toBeVisible();
  await page.getByLabel("Business", { exact: true }).selectOption({ label: scope.businessName });
  parseProviderProofAdmission(assistantProviderAdmission, scope);
  // Guard the actual outbound consent body before the provider grant exists.
  let guardedConsent = false;
  await page.route("**/api/mcp/oauth/authorize", async route => {
    try {
      const body = route.request().postDataJSON();
      if (body.workspaceId !== scope.workspaceId || body.agencyId !== null || body.decision !== "approve"
        || body.params?.client_id !== scope.clientId
        || (body.params?.scope ?? "").split(" ").sort().join(" ") !== [...scope.scopes].sort().join(" ")) throw new Error();
      await verifyProviderWorkspaceOwner(owner, scope);
      parseProviderProofAdmission(assistantProviderAdmission, scope);
      guardedConsent = true; await route.continue();
    } catch { await route.abort(); }
  });
  await verifyProviderWorkspaceOwner(owner, scope);
  claim = claimProviderDispatch(scope, `${scope.workspaceId}:${scope.clientId}`);
  await page.getByRole("button", { name: "Connect assistant", exact: true }).click();
  await expect(page).toHaveURL(u => u.origin === scope.providerOrigin, { timeout: 30_000 });
  expect(guardedConsent).toBe(true);
  const read = () => localSql<Array<{ id: string; scopes: string[]; userId: string; used: boolean; rotations: number }>>(`select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'scopes',c.scopes,'userId',c.user_id,'used',c.last_used_at is not null,'rotations',(select count(*) from public.assistant_refresh_tokens r where r.connection_id=c.id and consumed_at is not null))),'[]') from public.assistant_connections c where c.workspace_id=:'v1'::uuid and c.client_id=:'v2';`, scope.workspaceId, scope.clientId);
  // The actual provider must call/renew; this harness never exchanges fixture tokens.
  await expect.poll(() => read().some(c => c.used && c.rotations > 0), { timeout: 60_000 }).toBe(true);
  const connections = read(); expect(connections).toHaveLength(1); const connection = connections[0];
  if (!connection) throw new Error("Actual provider connection was not recorded.");
  expect(connection.userId).toBe(scope.ownerUserId); expect([...connection.scopes].sort()).toEqual([...scope.scopes].sort());
  claim.recordRequest(connection.id);
  await page.goto(`/connect?workspaceId=${scope.workspaceId}`);
  await page.getByRole("button", { name: `Disconnect ${scope.clientName}`, exact: true }).click();
  await verifyProviderWorkspaceOwner(owner, scope);
  parseProviderProofAdmission(assistantProviderAdmission, scope);
  await page.getByRole("button", { name: "Confirm disconnect", exact: true }).click();
  await expect(page.getByText("Its access and renewal tokens have been revoked.", { exact: true })).toBeVisible();
  expect(localSql<boolean>(`select c.revoked_at is not null and not exists(select 1 from public.assistant_tokens t where t.connection_id=c.id and t.revoked_at is null) and not exists(select 1 from public.assistant_refresh_tokens r join public.assistant_connections live on live.id=r.connection_id where r.connection_id=c.id and live.revoked_at is null and r.consumed_at is null and r.expires_at>clock_timestamp()) from public.assistant_connections c where c.id=:'v1'::uuid;`, connection.id)).toBe(true);
 } catch { throw new Error("Assistant provider proof held/failed; inspect private dispatch/native records. Details withheld."); }
 finally { claim?.close(); await owner.close(); }
});
