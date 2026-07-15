import { describe, expect, it } from "vitest";
import { rekeySegments, renameTenantSlug } from "@/lib/tenant-rename";

describe("rekeySegments — anchored, whole-segment slug replacement", () => {
  it("rewrites the slug only as a full `:`-delimited segment", () => {
    expect(rekeySegments("events:gldf", "gldf", "great")).toBe("events:great");
    expect(rekeySegments("connections:gldf:google", "gldf", "great")).toBe("connections:great:google");
    expect(rekeySegments("reb:booking:slot:gldf:2026:1", "gldf", "great")).toBe("reb:booking:slot:great:2026:1");
  });

  it("does NOT rewrite a segment the slug is only a substring of (gld ⊄ gldf)", () => {
    expect(rekeySegments("events:gldf", "gld", "x")).toBe("events:gldf");
    expect(rekeySegments("connections:gldfoo:google", "gldf", "x")).toBe("connections:gldfoo:google");
  });

  it("rewrites every matching segment (defensive) but leaves non-matching ones", () => {
    expect(rekeySegments("reb:gldf:gldf", "gldf", "x")).toBe("reb:x:x");
    expect(rekeySegments("reb:crm-lock:gldf", "gldf", "x")).toBe("reb:crm-lock:x");
  });
});

describe("renameTenantSlug — input guards (before any DB/Redis touch)", () => {
  it("rejects a same-slug rename", async () => {
    const r = await renameTenantSlug("gldf", "gldf");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("same_slug");
  });

  it("rejects a reserved or malformed new slug", async () => {
    expect((await renameTenantSlug("gldf", "admin")).reason).toBe("invalid_new_slug");
    expect((await renameTenantSlug("gldf", "app")).reason).toBe("invalid_new_slug");
    expect((await renameTenantSlug("gldf", "Has Spaces")).reason).toBe("invalid_new_slug");
    expect((await renameTenantSlug("gldf", "-leadinghyphen")).reason).toBe("invalid_new_slug");
    expect((await renameTenantSlug("gldf", "UPPER")).reason).toBe("invalid_new_slug");
  });
});
