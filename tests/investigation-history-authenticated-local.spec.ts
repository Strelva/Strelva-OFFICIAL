import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { fixture, investigation, run } from "./support/runtime-data-native";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires real isolated loopback Auth, current migrations and workspace flags.");
test.setTimeout(240_000);
test("real owner pages committed investigation runs, retries an evicted exact request, and loses history access after revocation", async ({ browser }) => {
  const f = await fixture(browser, "history-owner");
  try {
    const created = await investigation(f);
    let current = created;
    // These are real native document comparisons, no seeded provider/public results.
    for (let i = 1; i <= 201; i++) current = await run(f, created.id, i - 1, `native-history-${i}`);
    expect(current.payload.runs).toHaveLength(200);
    expect(current.payload.runs.some((row: { requestId: string }) => row.requestId === "native-history-1")).toBe(false);
    const first = await f.owner.context.request.get(`/api/bounded-work?productId=investigations&workId=${created.id}&view=history&limit=100`);
    expect(first.status(), await first.text()).toBe(200);
    const page = await first.json(); expect(page.runs).toHaveLength(100); expect(page.nextBeforeRevision).toBe(102);
    const second = await f.owner.context.request.get(`/api/bounded-work?productId=investigations&workId=${created.id}&view=history&limit=100&beforeRevision=${page.nextBeforeRevision}`);
    expect(second.status()).toBe(200); const older = await second.json(); expect(older.runs).toHaveLength(100);
    expect(older.runs[0].revision).toBe(101); expect(older.runs.at(-1).revision).toBe(2);
    const exact = await f.admin.rpc("read_investigation_runs", { p_work_id: created.id, p_user_id: f.owner.userId, p_verified_email: f.owner.email, p_request_id: "native-history-1", p_before_revision: null, p_limit: 1 });
    expect(exact.error).toBeNull(); expect(exact.data[0]).toMatchObject({ revision: 1, run: { requestId: "native-history-1" } });
    const retry = await run(f, created.id, 201, "native-history-1"); expect(retry.payload.revision).toBe(201);
    const anon = createClient(f.env.url, f.env.anon, { auth: { persistSession: false } });
    expect((await anon.rpc("read_investigation_runs", { p_work_id: created.id, p_user_id: f.owner.userId, p_verified_email: f.owner.email })).error).not.toBeNull();
    expect((await f.admin.from("workspace_memberships").delete().eq("workspace_id", f.workspaceId).eq("user_id", f.owner.userId)).error).toBeNull();
    expect((await f.owner.context.request.get(`/api/bounded-work?productId=investigations&workId=${created.id}&view=history`)).status()).toBe(403);
    expect((await f.admin.rpc("read_investigation_runs", { p_work_id: created.id, p_user_id: f.owner.userId, p_verified_email: f.owner.email })).error?.message).toContain("workspace_access_denied");
  } finally { await f.close(); }
});
