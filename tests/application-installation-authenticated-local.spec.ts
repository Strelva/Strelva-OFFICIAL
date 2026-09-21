import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and database.");
test.setTimeout(120_000);

async function post(request: APIRequestContext, body: unknown, expectedStatus = 200) {
  const response = await request.post("/api/bounded-work", { headers: { origin: localEnvironment().app }, data: body });
  expect(response.status(), await response.text()).toBe(expectedStatus);
  return response.json();
}
async function read(request: APIRequestContext, workId: string) {
  const response = await request.get(`/api/bounded-work?productId=applications&workId=${workId}`);
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
async function command(request: APIRequestContext, workId: string, input: unknown) {
  return post(request, { action: "command", productId: "applications", workId, command: input });
}
async function publish(request: APIRequestContext, workId: string) {
  let app = await read(request, workId);
  app = await command(request, workId, { kind: "rehearse", expectedDesignRevision: app.payload.designRevision });
  return command(request, workId, { kind: "publish", expectedCandidateRevision: app.payload.designRevision, expectedReleaseVersion: app.payload.release?.version ?? null });
}

test("independently owned businesses install and update definitions without copying customer records", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const builder = await signedInContext(browser, admin, "reuse-builder");
  const customer = await signedInContext(browser, admin, "reuse-customer");
  try {
    for (const person of [builder, customer]) expect((await person.context.request.get("/api/workspace")).status()).toBe(200);
    const sourceSpace = randomUUID();
    const customerSpace = randomUUID();
    const spaces = await admin.from("workspaces").insert([
      { id: sourceSpace, kind: "customer", name: "Source repair business", created_by: builder.userId },
      { id: customerSpace, kind: "customer", name: "Harbor repair business", created_by: customer.userId },
    ]);
    expect(spaces.error).toBeNull();
    const memberships = await admin.from("workspace_memberships").insert([
      { workspace_id: sourceSpace, user_id: builder.userId, role: "owner", created_by: builder.userId },
      { workspace_id: customerSpace, user_id: customer.userId, role: "owner", created_by: customer.userId },
      { workspace_id: customerSpace, user_id: builder.userId, role: "admin", created_by: customer.userId },
    ]);
    expect(memberships.error).toBeNull();
    let source = await post(builder.context.request, { action: "create", productId: "applications", workspaceId: sourceSpace, input: {
      title: "Repair requests", fields: [{ id: "problem", label: "Problem", type: "text", required: true }],
      components: [{ kind: "form", fields: ["problem"] }, { kind: "list", fields: ["problem"] }],
    } }, 201);
    source = await publish(builder.context.request, source.id);
    source = await command(builder.context.request, source.id, { kind: "submit", expectedReleaseVersion: 1, expectedRecordsRevision: 0, record: { id: "source-private", values: { problem: "Private source business record" } } });
    let installed = await post(builder.context.request, { action: "from_source", productId: "applications", workspaceId: customerSpace, sourceWorkId: source.id }, 201);
    expect(installed.workspaceId).toBe(customerSpace);
    expect(installed.payload.records).toEqual([]);
    expect(installed.payload.installation).toMatchObject({ sourceWorkId: source.id, sourceVersion: 1 });
    expect(JSON.stringify(installed)).not.toContain("Private source business record");
    expect((await customer.context.request.get(`/api/bounded-work?productId=applications&workId=${source.id}`)).status()).toBe(403);
    installed = await publish(customer.context.request, installed.id);
    installed = await command(customer.context.request, installed.id, { kind: "submit", expectedReleaseVersion: 1, expectedRecordsRevision: 0, record: { id: "customer-record", values: { problem: "Customer business record" } } });
    installed = await command(customer.context.request, installed.id, { kind: "revise", expectedDesignRevision: installed.payload.designRevision, spec: { ...installed.payload.spec, title: "Harbor repairs" } });
    source = await command(builder.context.request, source.id, { kind: "revise", expectedDesignRevision: source.payload.designRevision, spec: { ...source.payload.spec, fields: [{ ...source.payload.spec.fields[0], label: "Repair detail" }] } });
    source = await publish(builder.context.request, source.id);
    installed = await command(builder.context.request, installed.id, { kind: "adopt_update", expectedRevision: installed.payload.revision, sourceVersion: source.payload.release.version });
    expect(installed.payload.spec.title).toBe("Harbor repairs");
    expect(installed.payload.spec.fields[0].label).toBe("Repair detail");
    expect(installed.payload.release.version).toBe(1);
    expect(installed.payload.records).toEqual([{ id: "customer-record", values: { problem: "Customer business record" } }]);
    installed = await publish(customer.context.request, installed.id);
    expect(installed.payload.release.version).toBe(2);
    expect(installed.payload.records).toHaveLength(1);
    expect(JSON.stringify(installed)).not.toContain("Private source business record");

    source = await command(builder.context.request, source.id, { kind: "revise", expectedDesignRevision: source.payload.designRevision, spec: { ...source.payload.spec, title: "Source changed its name" } });
    source = await publish(builder.context.request, source.id);
    await post(builder.context.request, { action: "command", productId: "applications", workId: installed.id, command: { kind: "adopt_update", expectedRevision: installed.payload.revision, sourceVersion: source.payload.release.version } }, 409);
    const unchanged = await read(customer.context.request, installed.id);
    expect(unchanged.payload.release.version).toBe(2);
    expect(unchanged.payload.spec.title).toBe("Harbor repairs");
    expect(unchanged.payload.records).toHaveLength(1);
  } finally {
    await builder.context.close();
    await customer.context.close();
  }
});
