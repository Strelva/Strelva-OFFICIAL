import { describe, expect, it } from "vitest";
import { APPLICATION_RECENT_VERSIONS, type ApplicationRelease } from "@/products/applications/contracts";
import { recentReleases } from "@/products/applications/repository";

const spec = {
  title: "Intake",
  maintenanceOwner: "owner",
  fields: [{ id: "name", label: "Name", type: "text" as const, required: true }],
  components: [{ kind: "form" as const, fields: ["name"] }],
};

function release(version: number): ApplicationRelease {
  return { version, spec, publishedAt: null, publishedBy: null, provenance: "published" } as ApplicationRelease;
}

describe("application compatibility release list", () => {
  it("lists the latest releases once there are more than the window", () => {
    const all = Array.from({ length: 130 }, (_, i) => release(i + 1));
    const listed = recentReleases(all, all.at(-1)!);
    expect(listed).toHaveLength(APPLICATION_RECENT_VERSIONS);
    expect(listed.at(-1)!.version).toBe(130);
  });

  it("keeps a rolled-back current release that is older than the window", () => {
    const all = Array.from({ length: 130 }, (_, i) => release(i + 1));
    const listed = recentReleases(all, all[0]!);
    expect(listed).toHaveLength(APPLICATION_RECENT_VERSIONS);
    expect(listed[0]!.version).toBe(1);
    expect(listed.at(-1)!.version).toBe(130);
  });
});
