import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";
import { issueAssistantFixture, nativeWorkspace } from "./support/money-agent-native";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Auth/database; bounded SQL issuer fixture, not public consent proof.");
test.setTimeout(120_000);

for (const ending of ["owner disconnect", "owner authority withdrawal"] as const) {
  test(`bounded issuer fixture: real Auth connection renewal stops after ${ending}`, async ({ browser }, info) => {
    const env = localEnvironment();
    const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
    const owner = await signedInContext(browser, admin, "assistant-owner");
    const stranger = await signedInContext(browser, admin, "assistant-stranger");
    try {
      const workspaceId = await nativeWorkspace(owner.context.request);
      await nativeWorkspace(stranger.context.request);
      const fixture = await issueAssistantFixture(admin, owner, workspaceId);
      const exchange = await owner.context.request.post("/api/mcp/oauth/token", { form: {
        grant_type: "authorization_code", client_id: fixture.clientId, resource: fixture.resource,
        code: fixture.code, code_verifier: fixture.verifier, redirect_uri: fixture.redirectUri,
      } });
      expect(exchange.status(), await exchange.text()).toBe(200);
      const initial = await exchange.json();
      expect(initial).toMatchObject({ token_type: "Bearer", business_workspace_id: workspaceId });
      const connectionsUrl = `/api/workspace/agent-connections?workspaceId=${workspaceId}`;
      const listed = await owner.context.request.get(connectionsUrl);
      expect(listed.status(), await listed.text()).toBe(200);
      const records = (await listed.json()).connections;
      expect(records).toEqual([expect.objectContaining({ clientName: fixture.clientName, status: "active" })]);
      expect(JSON.stringify(records)).not.toContain(initial.refresh_token);
      expect(JSON.stringify(records)).not.toContain(initial.access_token);
      const denied = await stranger.context.request.get(connectionsUrl);
      expect(denied.status(), await denied.text()).toBe(403);
      const rotate = (refresh: string) => owner.context.request.post("/api/mcp/oauth/token", { form: {
        grant_type: "refresh_token", refresh_token: refresh, client_id: fixture.clientId, resource: fixture.resource,
      } });
      const renewed = await rotate(initial.refresh_token);
      expect(renewed.status(), await renewed.text()).toBe(200);
      const next = await renewed.json();
      expect(next.refresh_token).not.toBe(initial.refresh_token);
      expect(next.access_token).not.toBe(initial.access_token);
      const readBusiness = (token: string) => owner.context.request.post("/api/mcp/public", {
        headers: { authorization: `Bearer ${token}`, accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25" },
        data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read_business_context", arguments: {} } },
      });
      const liveRead = await readBusiness(next.access_token);
      expect(liveRead.status(), await liveRead.text()).toBe(200);
      expect((await liveRead.json()).result.isError).toBe(false);
      const page = await owner.context.newPage();
      await page.goto(`/workspace?workspaceId=${workspaceId}&view=settings`);
      const panel = page.locator("section", { has: page.getByRole("heading", { name: "Connected assistants", exact: true }) });
      await expect(panel.getByRole("heading", { name: fixture.clientName, exact: true })).toBeVisible();
      await expect(panel).toContainText("Connected");
      if (ending === "owner disconnect") {
        await panel.getByRole("button", { name: `Disconnect ${fixture.clientName}`, exact: true }).click();
        await expect(panel.getByRole("button", { name: "Confirm disconnect", exact: true })).toBeVisible();
        await panel.getByRole("button", { name: "Keep connected", exact: true }).click();
        await expect(panel.getByRole("button", { name: "Confirm disconnect", exact: true })).toHaveCount(0);
        await panel.getByRole("button", { name: `Disconnect ${fixture.clientName}`, exact: true }).click();
        await panel.getByRole("button", { name: "Confirm disconnect", exact: true }).click();
        await expect(panel).toContainText("Its access and renewal tokens have been revoked.");
        await expect(panel).toContainText("Disconnected");
        const after = await owner.context.request.get(connectionsUrl);
        expect((await after.json()).connections).toEqual([expect.objectContaining({ status: "revoked" })]);
      } else {
        const removed = await admin.from("workspace_memberships").delete().eq("workspace_id", workspaceId).eq("user_id", owner.userId);
        expect(removed.error).toBeNull();
        const after = await owner.context.request.get(connectionsUrl);
        expect(after.status(), await after.text()).toBe(403);
        const disconnect = await owner.context.request.delete(`/api/workspace/agent-connections/${records[0].id}`, {
          headers: { origin: env.app }, data: { workspaceId },
        });
        expect(disconnect.status(), await disconnect.text()).toBe(403);
      }
      const stoppedRead = await readBusiness(next.access_token);
      expect(stoppedRead.status(), await stoppedRead.text()).toBe(401);
      const stopped = await rotate(next.refresh_token);
      expect(stopped.status(), await stopped.text()).toBe(400);
      expect(await stopped.json()).toEqual({ error: "invalid_grant" });
      await page.screenshot({ path: info.outputPath(`assistant-${ending.replaceAll(" ", "-")}.png`), fullPage: true });
    } finally {
      await owner.context.close();
      await stranger.context.close();
      // Identities and immutable connection history remain in the disposable stack.
    }
  });
}
