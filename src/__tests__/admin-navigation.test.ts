import { describe, expect, it } from "vitest";
import { NAV } from "@/app/admin/AdminRail";
import { workspaceHref } from "@/app/admin/work/workspace-href";

describe("internal Strelva navigation", () => {
  it("keeps delivery, support, and system administration visibly separate", () => {
    expect(NAV.map((group) => group.label ?? "Primary")).toEqual([
      "Primary",
      "Delivery",
      "Support",
      "System administration",
    ]);
    expect(NAV.flatMap((group) => group.items).map(({ href, label }) => [href, label])).toEqual(expect.arrayContaining([
      ["/admin/work", "Internal work"],
      ["/admin/actions", "Managed-site work"],
      ["/admin/clients", "Clients"],
      ["/admin/ops", "Ops"],
      ["/admin/audit", "Audit"],
    ]));
  });

  it("leaves the bare admin host before opening scoped workspace work", () => {
    expect(workspaceHref("admin.strelva.com", "https", "operations"))
      .toBe("https://app.strelva.com/workspace?view=operations");
    expect(workspaceHref("admin.localhost:3100", "http", "product-learning"))
      .toBe("http://localhost:3100/workspace?view=product-learning");
    expect(workspaceHref("localhost:3100", "http", "operations"))
      .toBe("/workspace?view=operations");
  });
});
