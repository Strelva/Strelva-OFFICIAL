import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localEnvironment, signedInContext } from "./support/local-auth";
import { localSql, noHorizontalOverflow } from "./support/journeys";
import { moneyPost, nativeWorkspace } from "./support/money-agent-native";
import admission from "./support/ordinary-source-admission.cjs";
test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires a separate fresh owned local native/Auth window; providers held.");
test.beforeAll(() => admission.ordinarySourcePreflight(process.env));
test.setTimeout(300000);
const sourcePath = "/api/workspace/version-sources";
const sourceSnapshot = (id: string) => localSql("select json_build_object('source',to_jsonb(s),'revisions',(select coalesce(jsonb_agg(to_jsonb(r) order by number),'[]') from public.system_version_source_revisions r where r.source_system_id=s.system_id)) from public.system_version_sources s where system_id=:'v1'::uuid;", id);
const nativeSnapshot = (id: string) => localSql<{
    workspaceId: string;
    sourceId: string;
    sourceRevision: string;
    records: unknown[];
    bindings: unknown[];
    currentRelease: unknown;
    status: string;
}>("select json_build_object('workspaceId',v.business_workspace_id,'sourceId',v.source_system_id,'sourceRevision',v.baseline_revision_id,'records',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.application_records a where a.work_id=n.work_id),'bindings',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from public.system_version_bindings b where b.version_id=v.id),'currentRelease',v.current_release,'status',s.lifecycle_status) from public.system_versions v join public.system_version_native_applications n on n.version_id=v.id join public.application_states s on s.work_id=n.work_id and s.workspace_id=n.business_workspace_id where v.id=:'v1'::uuid;", id);
test(admission.ordinarySourceCase, async ({ browser }, info) => {
    const env = localEnvironment();
    const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
    const customer = await signedInContext(browser, admin, "ordinary-source-customer");
    const agencyOwner = await signedInContext(browser, admin, "ordinary-source-agency");
    const recipient = await signedInContext(browser, admin, "ordinary-source-recipient");
    const reviewer = await signedInContext(browser, admin, "ordinary-source-reviewer");
    const stranger = await signedInContext(browser, admin, "ordinary-source-stranger");
    const anonymous = await browser.newContext({ baseURL: env.app });
    const responseCleanups: Array<() => Promise<void>> = [];
    try {
        const customerId = await nativeWorkspace(customer.context.request), destination = await nativeWorkspace(recipient.context.request);
        await nativeWorkspace(agencyOwner.context.request);
        await nativeWorkspace(reviewer.context.request);
        await nativeWorkspace(stranger.context.request);
        expect(localSql<number>("select count(*)::integer from public.workspace_memberships m join public.workspaces w on w.id=m.workspace_id where m.user_id=:'v1'::uuid and w.kind='agency';", customer.userId)).toBe(0);
        const agency = await moneyPost(agencyOwner.context.request, "/api/workspace", { action: "create_agency", name: "Fictional ordinary source agency" }, 201);
        // Explicit fictional review policy and membership prerequisites only. Every
        // source, revision, share, qualification and Version is produced by app HTTP.
        localSql("insert into public.system_revision_reviewers(user_id,policy_version) values(:'v1'::uuid,'fictional-ordinary-source-local-review'); select 'true'::json;", reviewer.userId);
        for (const [kind, owner, workspaceId] of [["customer", customer, customerId], ["agency", agencyOwner, agency.workspaceId]] as const) {
            localSql("insert into public.workspace_memberships(workspace_id,user_id,role) values(:'v1'::uuid,:'v2'::uuid,'admin'),(:'v3'::uuid,:'v4'::uuid,'member'); select 'true'::json;", workspaceId, reviewer.userId, destination, owner.userId);
            const page = await owner.context.newPage();
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.goto(`/workspace/version-sources?workspaceId=${workspaceId}`);
            await expect(page.getByRole("heading", { name: "Reusable applications", exact: true })).toBeVisible();
            const title = `Fictional ${kind} repair requests ${randomUUID().slice(0, 6)}`;
            await page.getByLabel("Application name", { exact: true }).fill(title);
            await page.getByLabel("Question label", { exact: true }).fill("What needs fixing?");
            const createdResponse = page.waitForResponse(r => new URL(r.url()).pathname === sourcePath && r.request().postDataJSON()?.action === "create");
            let revision: {
                source: {
                    businessId: string;
                    systemId: string;
                    revisionId: string;
                    number: number;
                };
                qualification: {
                    status: string;
                };
            };
            if (kind === "customer") {
                // Dispatch the browser publish once through the real route. Only lose its
                // response after the exact native commit has returned; never invent 201.
                let resolveCommit!: (value: typeof revision) => void, rejectCommit!: (cause: unknown) => void;
                const committed = new Promise<typeof revision>((resolve, reject) => { resolveCommit = resolve; rejectCommit = reject; });
                void committed.catch(() => undefined);
                let publishCommand: unknown, dispatches = 0;
                const pattern = "**/api/workspace/version-sources";
                const handler: Parameters<typeof page.route>[1] = async (route) => {
                    const command = route.request().postDataJSON();
                    if (command?.action !== "publish") {
                        await route.continue();
                        return;
                    }
                    dispatches++;
                    try {
                        expect(dispatches).toBe(1);
                        publishCommand = command;
                        const result = await route.fetch({ maxRetries: 0, maxRedirects: 0 });
                        expect(result.status(), await result.text()).toBe(201);
                        const actual = await result.json();
                        expect(actual.source).toMatchObject({ businessId: workspaceId, systemId: command.systemId, revisionId: command.commandId, number: 1 });
                        await route.abort("failed");
                        resolveCommit(actual);
                    }
                    catch (cause) {
                        rejectCommit(cause);
                        await route.abort("failed").catch(() => undefined);
                    }
                };
                await page.route(pattern, handler);
                let removed = false;
                const remove = async () => { if (!removed) {
                    await page.unroute(pattern, handler);
                    removed = true;
                } };
                responseCleanups.push(remove);
                await page.getByRole("button", { name: "Save reusable source", exact: true }).focus();
                await page.keyboard.press("Enter");
                revision = await committed;
                await expect(page.getByRole("button", { name: "Retry the same source command", exact: true })).toBeVisible();
                await expect(page.getByLabel("Application name", { exact: true })).toBeDisabled();
                const saved = sourceSnapshot(revision.source.systemId);
                await remove();
                const retried = page.waitForResponse(r => new URL(r.url()).pathname === sourcePath && r.request().postDataJSON()?.action === "publish");
                await page.getByRole("button", { name: "Retry the same source command", exact: true }).click();
                const result = await retried;
                expect(result.status(), await result.text()).toBe(201);
                expect(result.request().postDataJSON()).toEqual(publishCommand);
                expect(sourceSnapshot(revision.source.systemId)).toEqual(saved);
            }
            else {
                const publishedResponse = page.waitForResponse(r => new URL(r.url()).pathname === sourcePath && r.request().postDataJSON()?.action === "publish");
                await page.getByRole("button", { name: "Save reusable source", exact: true }).focus();
                await page.keyboard.press("Enter");
                const published = await publishedResponse;
                expect(published.status(), await published.text()).toBe(201);
                revision = await published.json();
            }
            const created = await createdResponse;
            expect(created.status(), await created.text()).toBe(201);
            const source = (await created.json()).source;
            expect(revision.source).toMatchObject({ ...source, number: 1 });
            expect(revision.qualification.status).not.toBe("qualified");
            await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
            await noHorizontalOverflow(page);
            await page.screenshot({ path: info.outputPath(`${kind}-source-desktop.png`), fullPage: true });
            await page.getByLabel("Receiving business", { exact: true }).selectOption(destination);
            const sharedResponse = page.waitForResponse(r => new URL(r.url()).pathname === sourcePath && r.request().postDataJSON()?.action === "share");
            await page.getByRole("button", { name: `Share ${title}`, exact: true }).click();
            expect((await sharedResponse).status()).toBe(200);
            const query = new URLSearchParams({ workspaceId: destination, sourceWorkspaceId: workspaceId, sourceSystemId: source.systemId, revisionId: revision.source.revisionId, number: "1" });
            const incoming = await recipient.context.newPage();
            await incoming.setViewportSize({ width: 390, height: 844 });
            await incoming.goto(`/workspace/version-sources?${query}`);
            await expect(incoming.getByRole("button", { name: "Create separate draft Version", exact: true })).toBeDisabled();
            const install = { action: "install", workspaceId: destination, source: revision.source, name: title, commandId: randomUUID() };
            expect((await recipient.context.request.post(sourcePath, { headers: { origin: env.app }, data: install })).status()).toBe(400);
            expect(localSql<number>("select count(*)::integer from public.system_versions where source_system_id=:'v1'::uuid;", source.systemId)).toBe(0);
            await moneyPost(owner.context.request, "/api/workspace/packages", { action: "qualify", workspaceId, revisionId: revision.source.revisionId });
            await moneyPost(reviewer.context.request, "/api/workspace/packages", { action: "review", workspaceId, revisionId: revision.source.revisionId, approve: true, note: "Fictional local exact form review; independent recipient records and owner release." });
            const grant = await recipient.context.request.post(sourcePath, { headers: { origin: env.app }, data: { action: "grant_install", workspaceId: destination, agencyWorkspaceId: agency.workspaceId, revisionId: revision.source.revisionId, commandId: randomUUID(), expiresAt: new Date(Date.now() + 3600000).toISOString() } });
            expect([400, 403]).toContain(grant.status()); // No selected/staffed provider seat.
            const before = sourceSnapshot(source.systemId);
            await incoming.reload();
            await expect(incoming.getByRole("button", { name: "Create separate draft Version", exact: true })).toBeEnabled();
            await noHorizontalOverflow(incoming);
            await incoming.screenshot({ path: info.outputPath(`${kind}-recipient-mobile.png`), fullPage: true });
            const installedResponse = incoming.waitForResponse(r => new URL(r.url()).pathname === sourcePath && r.request().postDataJSON()?.action === "install");
            await incoming.getByRole("button", { name: "Create separate draft Version", exact: true }).focus();
            await incoming.keyboard.press("Enter");
            const installed = await installedResponse;
            expect(installed.status(), await installed.text()).toBe(201);
            const receipt = await installed.json();
            const actualCommand = installed.request().postDataJSON();
            expect(receipt.workspaceId).toBe(destination);
            expect(nativeSnapshot(receipt.versionId)).toMatchObject({ workspaceId: destination, sourceId: source.systemId, sourceRevision: revision.source.revisionId, records: [], bindings: [], status: "draft" });
            const current = nativeSnapshot(receipt.versionId);
            expect(current.currentRelease).toBeNull();
            expect(await moneyPost(recipient.context.request, sourcePath, actualCommand, 201)).toEqual(receipt);
            expect(localSql<number>("select count(*)::integer from public.system_versions where source_system_id=:'v1'::uuid;", source.systemId)).toBe(1);
            expect(sourceSnapshot(source.systemId)).toEqual(before);
            const prepare = await moneyPost(recipient.context.request, "/api/workspace/versions/manage", { action: "prepare_release", workspaceId: destination, systemId: receipt.systemId, versionId: receipt.versionId, rowRevision: receipt.rowRevision });
            expect(prepare.outcome).toBe("prepared");
            expect(nativeSnapshot(receipt.versionId).currentRelease).toBeNull();
            await incoming.goto(`/workspace?workspaceId=${destination}`);
            const needs = incoming.getByRole("region", { name: "Needs you" });
            const ask = `Put the updated ${title} live`;
            await expect(needs.getByRole("button", { name: `Approve: ${ask}`, exact: true })).toBeVisible();
            const approved = incoming.waitForResponse(r => new URL(r.url()).pathname === "/api/workspace/needs-you" && r.request().method() === "POST");
            await needs.getByRole("button", { name: `Approve: ${ask}`, exact: true }).click();
            expect((await (await approved).json()).status).toBe("done");
            await expect.poll(() => nativeSnapshot(receipt.versionId).currentRelease).toBe(1);
            expect(nativeSnapshot(receipt.versionId)).toMatchObject({ records: [], bindings: [], status: "installed" });
            expect(sourceSnapshot(source.systemId)).toEqual(before);
            expect((await stranger.context.request.get(`${sourcePath}?workspaceId=${workspaceId}`)).status()).toBe(403);
            expect((await anonymous.request.get(`${sourcePath}?workspaceId=${workspaceId}`)).status()).toBe(401);
            const wrong = new URLSearchParams(query);
            wrong.set("revisionId", randomUUID());
            expect((await recipient.context.request.get(`${sourcePath}?${wrong}`)).status()).toBe(403);
            expect((await recipient.context.request.post(sourcePath, { headers: { origin: env.app }, data: { action: "create", workspaceId, name: "Foreign source", commandId: randomUUID() } })).status()).toBe(403);
            await moneyPost(owner.context.request, sourcePath, { action: "share", workspaceId, systemId: source.systemId, businessId: destination, shared: false });
            expect((await recipient.context.request.post(sourcePath, { headers: { origin: env.app }, data: { ...actualCommand, commandId: randomUUID() } })).status()).toBe(403);
            expect((await recipient.context.request.get(`${sourcePath}?${query}`)).status()).toBe(403);
            expect(localSql<number>("select count(*)::integer from public.system_versions where source_system_id=:'v1'::uuid;", source.systemId)).toBe(1);
            const retained = sourceSnapshot(source.systemId);
            const exited = await moneyPost(owner.context.request, "/api/workspace-exit", { workspaceId, futureWork: "cancel", providerParticipation: "revoke", maintainedResources: { kind: "stop" }, notes: "Fictional ordinary source exit", idempotencyKey: randomUUID() });
            expect(exited.state.status).toBe("completed");
            for (const stopped of [{ action: "create", workspaceId, name: "Stopped source", commandId: randomUUID() }, { action: "publish", workspaceId, systemId: source.systemId, commandId: randomUUID(), expectedRevision: 1, summary: "Stopped revision", definition: { kind: "internal_app", title, fields: [{ id: "request", label: "What needs fixing?", type: "text", required: true }], components: [{ kind: "form", fields: ["request"] }] } }, { action: "share", workspaceId, systemId: source.systemId, businessId: destination, shared: true }])
                expect((await owner.context.request.post(sourcePath, { headers: { origin: env.app }, data: stopped })).status()).toBe(400);
            expect(sourceSnapshot(source.systemId)).toEqual(retained);
            await page.reload();
            await expect(page.getByText("Source changes and installation require current owner or admin access in an active business workspace.", { exact: true })).toBeVisible();
            expect(await page.getByRole("button", { name: "Save reusable source", exact: true }).count()).toBe(0);
            localSql("delete from public.workspace_memberships where workspace_id=:'v1'::uuid and user_id=:'v2'::uuid; select 'true'::json;", workspaceId, owner.userId);
            expect((await owner.context.request.post(sourcePath, { headers: { origin: env.app }, data: { action: "create", workspaceId, name: "Withdrawn author", commandId: randomUUID() } })).status()).toBe(403);
            expect(sourceSnapshot(source.systemId)).toEqual(retained);
            await page.reload();
            await expect(page.getByRole("alert")).toContainText("Sources could not be loaded");
            expect(await page.getByRole("button", { name: "Save reusable source", exact: true }).count()).toBe(0);
            await page.close();
            await incoming.close();
        }
    }
    finally {
        for (const remove of responseCleanups)
            await remove().catch(() => undefined);
        await anonymous.close();
        for (const person of [customer, agencyOwner, recipient, reviewer, stranger])
            await person.context.close();
        // Retain actual native immutable fixtures on the disposable supplemental
        // stack for inspection. Never delete source or Version history as cleanup.
    }
});
