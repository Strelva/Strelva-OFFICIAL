import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { appendVersion, getVersions, restoreVersion, getContent } from "../lib/storage";

/**
 * Content versioning — the revision spine (ontology Phase 4).
 *
 * Exercises the append -> getVersions -> restore cycle through the dev-file
 * storage path (DATA_SOURCE unset, same harness as content-crud.test.ts). This
 * locks the semantics the agent's undo tool and the dashboard restore button
 * depend on:
 *
 *  - getVersions is NEWEST-FIRST (versions[0] is the current live content,
 *    versions[1] is what it looked like before it — see buildUndoTool).
 *  - restoreVersion APPENDS a new head equal to the target and PRESERVES the
 *    prior head in history (a restore is non-destructive; no data loss).
 *  - an empty history is a safe no-op (returns null, no write).
 *  - field-level `changes` are recorded on each version.
 */

const TEST_TENANT = "__test_content_versioning";

function devContentPath(tenant: string): string {
  return path.join(process.cwd(), `dev-content-${tenant}.json`);
}

async function cleanup(tenant: string) {
  try {
    await fs.unlink(devContentPath(tenant));
  } catch {
    // file didn't exist — fine
  }
}

describe("content versioning — append / get / restore", () => {
  beforeAll(() => cleanup(TEST_TENANT));
  afterAll(() => cleanup(TEST_TENANT));
  beforeEach(() => cleanup(TEST_TENANT));

  it("returns an empty history before any version is appended", async () => {
    const versions = await getVersions("hero", TEST_TENANT);
    expect(versions).toEqual([]);
  });

  it("restoring against an empty history is a safe no-op", async () => {
    const restored = await restoreVersion("hero", "v_does_not_exist", TEST_TENANT);
    expect(restored).toBeNull();
    // No write happened — history is still empty.
    expect(await getVersions("hero", TEST_TENANT)).toEqual([]);
  });

  it("restoring an unknown versionId with existing history is a no-op", async () => {
    await appendVersion("hero", { headline: "only" }, "user", TEST_TENANT);
    const restored = await restoreVersion("hero", "v_nope", TEST_TENANT);
    expect(restored).toBeNull();
    // History untouched — still exactly the one real version.
    const versions = await getVersions("hero", TEST_TENANT);
    expect(versions).toHaveLength(1);
    expect(versions[0]!.data).toEqual({ headline: "only" });
  });

  it("appends N versions and returns them newest-first", async () => {
    await appendVersion("hero", { headline: "v1" }, "user", TEST_TENANT);
    await appendVersion("hero", { headline: "v2" }, "ai", TEST_TENANT);
    await appendVersion("hero", { headline: "v3" }, "admin", TEST_TENANT);

    const versions = await getVersions("hero", TEST_TENANT);
    expect(versions).toHaveLength(3);
    // Newest-first: last appended is index 0 (the invariant buildUndoTool relies on).
    expect(versions.map((v) => (v.data as { headline: string }).headline)).toEqual([
      "v3",
      "v2",
      "v1",
    ]);
    expect(versions[0]!.author).toBe("admin");
    // Only the head is "live"; earlier ones are marked rolled-back on the dev path.
    expect(versions[0]!.status).toBe("live");
    expect(versions[1]!.status).toBe("rolled-back");
    expect(versions[2]!.status).toBe("rolled-back");
  });

  it("records field-level changes on a version", async () => {
    const changes = [{ field: "headline", before: "Old", after: "New" }];
    await appendVersion("hero", { headline: "New" }, "ai", TEST_TENANT, changes);

    const [head] = await getVersions("hero", TEST_TENANT);
    expect(head!.changes).toEqual(changes);
  });

  it("retains the governed request identity beside the published version", async () => {
    const requestId = "evt_website_request_123";
    await appendVersion("hero", { headline: "Requested change" }, "user", TEST_TENANT, [], requestId);

    const [head] = await getVersions("hero", TEST_TENANT);
    expect(head!.requestId).toBe(requestId);
    expect(head!.changes).toEqual([]);
  });

  it("restores an older version: appends a new head equal to it AND preserves the prior head", async () => {
    const v1Data = { headline: "v1-original" };
    const v2Data = { headline: "v2-latest" };
    const v1 = await appendVersion("hero", v1Data, "user", TEST_TENANT);
    await appendVersion("hero", v2Data, "user", TEST_TENANT);

    // Sanity: v2 is the current head before the restore.
    let versions = await getVersions("hero", TEST_TENANT);
    expect((versions[0]!.data as { headline: string }).headline).toBe("v2-latest");

    const restored = await restoreVersion("hero", v1.id, TEST_TENANT);
    expect(restored).not.toBeNull();

    versions = await getVersions("hero", TEST_TENANT);
    // A restore is an append, not a rewind: history grew to 3 entries.
    expect(versions).toHaveLength(3);
    // New head equals the restored target's data.
    expect(versions[0]!.data).toEqual(v1Data);
    expect(versions[0]!.id).toBe(restored!.id);
    // NO DATA LOSS: the pre-restore head (v2) is still present in history.
    expect((versions[1]!.data as { headline: string }).headline).toBe("v2-latest");
    // The original v1 entry is also still there (history is append-only).
    expect(versions.some((v) => v.id === v1.id)).toBe(true);
    // The live published content now reflects the restored version.
    const live = await getContent("hero", TEST_TENANT);
    expect((live as { headline: string }).headline).toBe("v1-original");
  });

  it("marks a restore with a _restore change entry", async () => {
    const v1 = await appendVersion("hero", { headline: "start" }, "user", TEST_TENANT);
    await appendVersion("hero", { headline: "changed" }, "user", TEST_TENANT);
    const restored = await restoreVersion("hero", v1.id, TEST_TENANT);
    expect(restored!.changes?.some((c) => c.field === "_restore")).toBe(true);
  });

  it("restores from a single-version history without losing it", async () => {
    const only = await appendVersion("hero", { headline: "solo" }, "user", TEST_TENANT);
    const restored = await restoreVersion("hero", only.id, TEST_TENANT);
    expect(restored).not.toBeNull();
    const versions = await getVersions("hero", TEST_TENANT);
    expect(versions).toHaveLength(2);
    expect(versions[0]!.data).toEqual({ headline: "solo" });
    expect(versions.some((v) => v.id === only.id)).toBe(true);
  });
});
