import { describe, expect, it } from "vitest";
import { operatorDestinations, operatorDestination } from "@/experience/operator/destinations";
import { workspaceHref } from "@/app/admin/work/workspace-href";

describe("internal Strelva navigation", () => {
  it("uses the destination registry for platform support and agency work", () => {
    const destinations = operatorDestinations({ moneyEnabled: true });
    expect(destinations.map(({ href, label }) => [href, label])).toEqual(expect.arrayContaining([
      ["/admin/queue", "Queue"], ["/admin/work", "Internal work"],
      ["/admin/actions", "Strelva Agency work"], ["/admin/clients", "Sites"],
      ["/admin/ops", "Operational health"], ["/admin/audit", "Site audits"],
      ["/admin/uptime", "Checks"], ["/admin/accounts", "Billing groups"],
      ["/admin/client-leads/inquiries", "Inquiry review"],
    ]));
    expect(destinations.find(item => item.href === "/admin/actions")?.group).toBe("Strelva Agency");
    expect(operatorDestination("/admin/client-leads/inquiries")?.label).toBe("Inquiry review");
    expect(operatorDestination("/admin/tenants/mooney")?.label).toBe("Sites");
    expect(operatorDestination("/admin/not-a-destination")).toBeUndefined();
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
