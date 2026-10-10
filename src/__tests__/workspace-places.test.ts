import { describe, expect, it } from "vitest";
import { isRetiredView, pinnedApps, pinnedWebsites, placeForSection, sectionFromView, sectionTitle, workspaceSectionHref } from "@/experience/app-frame/workspace-places";

describe("workspace places", () => {
  it("puts every view in a main place, the app list or the business menu", () => {
    for (const view of ["home", "requests", "ongoing"] as const) expect(placeForSection(view)).toBe(view);
    for (const view of ["apps", "work", "products"] as const) expect(placeForSection(view)).toBe("apps");
    for (const view of ["settings", "access", "help", "account"] as const) expect(placeForSection(view)).toBe(view);
    expect(placeForSection(undefined)).toBeUndefined();
  });

  it("keeps links written before these places working", () => {
    expect(sectionFromView("requests")).toBe("requests");
    expect(sectionFromView("delivery")).toBe("requests");
    expect(sectionFromView("work")).toBe("work");
    expect(sectionFromView("ongoing")).toBe("ongoing");
    expect(sectionFromView("operations")).toBe("ongoing");
    expect(sectionFromView("products")).toBe("products");
    for (const view of ["tracker", "inquiries", "document", "plan"]) expect(sectionFromView(view)).toBe("work");
    // The Customers page is retired (October 6). Its old address opens Home.
    expect(sectionFromView("customers")).toBe("home");
    expect(isRetiredView("customers")).toBe(true);
    for (const view of [null, undefined, "", "home", "requests", "apps"]) expect(isRetiredView(view)).toBe(false);
    expect(sectionFromView("apps")).toBe("apps");
    // October 6: Needs you is its own place (the layout opens Home while its release is off).
    expect(sectionFromView("needs-you")).toBe("needs-you");
    expect(sectionTitle("needs-you")).toBe("Needs you");
    expect(workspaceSectionHref("needs-you", "", "b1")).toBe("/workspace?view=needs-you&workspaceId=b1");
  });

  it("falls back to Home for missing, unknown or unsafe views", () => {
    for (const view of [null, undefined, "", "start", "account", "admin", "__proto__", "toString"]) expect(sectionFromView(view)).toBe("home");
  });

  it("names sections with the owner's words", () => {
    expect(sectionTitle("home")).toBe("Home");
    expect(sectionTitle("requests")).toBe("Requests");
    expect(sectionTitle("ongoing")).toBe("Running");
    // The app list is "Apps" until STRELVA_SYSTEMS_RELEASE is on.
    expect(sectionTitle("work")).toBe("Apps");
    expect(sectionTitle("products")).toBe("Apps");
    expect(sectionTitle("apps", true)).toBe("Systems");
    expect(sectionTitle("work", true)).toBe("Systems");
    expect(sectionTitle("products", true)).toBe("Systems");
    expect(sectionTitle("settings")).toBe("Business details");
    expect(sectionTitle("access")).toBe("People & access");
  });

  it("builds links that round-trip through the view parser", () => {
    expect(workspaceSectionHref("home")).toBe("/workspace");
    expect(workspaceSectionHref("requests", "", "w1")).toBe("/workspace?view=requests&workspaceId=w1");
    expect(workspaceSectionHref("account", "https://app.example", "w1")).toBe("https://app.example/workspace/account");
    for (const section of ["requests", "apps", "work", "ongoing", "products", "settings", "access", "help"] as const) {
      const view = new URL(workspaceSectionHref(section, "https://app.example")).searchParams.get("view");
      expect(sectionFromView(view)).toBe(section);
    }
  });

  it("pins assigned websites in their given order without colliding with work ids", () => {
    expect(pinnedWebsites([{ id: "a", title: "attymooney.com", href: "/dashboard?tenant=a" }, { id: "b", title: "B", href: "/b" }]))
      .toEqual([{ id: "site-a", title: "attymooney.com", href: "/dashboard?tenant=a", kind: "website" }, { id: "site-b", title: "B", href: "/b", kind: "website" }]);
  });

  it("pins apps by name and leaves saved files and unavailable apps in the full list", () => {
    const pinned = pinnedApps([
      { id: "1", title: "Intake", productId: "applications" },
      { id: "2", title: "Opening checklist", productId: "documents" },
      { id: "3", title: "Quotes", productId: "custom-applications" },
      { id: "4", title: "Removed app", productId: "applications", unavailableReason: "Access changed." },
    ], id => `/workspace?work=${id}`);
    expect(pinned.map(item => [item.id, item.title, item.href, item.kind])).toEqual([["app-1", "Intake", "/workspace?work=1", "app"], ["app-3", "Quotes", "/workspace?work=3", "app"]]);
    expect(pinnedApps(Array.from({ length: 9 }, (_, index) => ({ id: String(index), title: `App ${index}`, productId: "applications" })), id => id)).toHaveLength(6);
  });
});
