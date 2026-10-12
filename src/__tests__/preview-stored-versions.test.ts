import { describe, expect, it } from "vitest";
import { previewStoredVersions } from "@/experience/workspace/preview/systems-fixture";
import { previewSystems } from "@/experience/workspace/preview/systems-projection";
import type { WorkspaceSystemEntry } from "@/experience/workspace/contracts";

const MOONEY = "a0000000-0000-4000-8000-000000000001";
const entry = (systemId: string, savedWorkId: string | null) => ({ ref: { systemId }, savedWorkId } as unknown as WorkspaceSystemEntry);

describe("preview Version lineage", () => {
  it("records the Mooney intake as a Version of the agency's source, and nothing else", () => {
    const rows = previewStoredVersions(MOONEY, [entry("s-site", null), entry("s-intake", "b0000000-0000-4000-8000-000000000002")]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ systemId: "s-intake", source: { name: "Intake for professional practices", hidden: false }, context: { label: "The Mooney Firm" } });
    expect(previewStoredVersions(MOONEY, [entry("s-site", null)])).toEqual([]);
    expect(previewStoredVersions("a0000000-0000-4000-8000-000000000003", [entry("s-intake", "b0000000-0000-4000-8000-000000000002")])).toEqual([]);
  });

  it("reaches the projection the preview page renders", async () => {
    const preview = await previewSystems("mooney", { systems: true });
    const projection = preview.systems[MOONEY];
    expect(projection?.versions).toHaveLength(1);
    const intake = projection!.systems.find(system => system.name === "Mediation intake");
    expect(projection!.versions![0]!.systemId).toBe(intake!.ref.systemId);
  });

  it("claims no lineage with the Systems release off", async () => {
    const preview = await previewSystems("mooney", { systems: false });
    expect(preview.systems).toEqual({});
  });
});
