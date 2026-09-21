import { describe, it } from "vitest";
import assert from "node:assert/strict";
import {
  planWorkspaceStart,
  createWorkspaceStartContinuation,
  workspaceStartContinueLabel,
  type WorkspaceStartContext,
} from "../experience/workspace/workspace-start";

const nativeContext: WorkspaceStartContext = {
  products: [
    { id: "applications", availability: "available" },
    { id: "onboarding", availability: "available" },
    { id: "documents", availability: "available" },
    { id: "tracker", availability: "available" },
    { id: "websites", availability: "available" },
    { id: "inquiries", availability: "available" },
    { id: "managed_presence", availability: "managed" },
  ],
  managedSites: [{ id: "site-a", title: "Business A", href: "/dashboard?tenant=site-a" }],
  inquiryBusinesses: [{ id: "business-a", title: "Business A" }],
  trackerTemplates: [{ id: "tasks", label: "Task tracker" }],
};

// These are routing proposals. None may imply an accepted delivery or grant.
describe("agency and native entry", () => {
  for (const request of [
    "Have Strelva build our website.",
    "I want Strelva to design my website.",
    "Hire Strelva to make a landing page for us.",
    "We need an agency-built website.",
    "I need a website delivered in 24 hours.",
    "Build our website using the 24-hour offer.",
    "Get a done-for-us website.",
  ]) {
    it(`keeps agency delivery out of generation: ${request}`, () => {
      const plan = planWorkspaceStart(request, nativeContext);
      assert.equal(plan.deliveryMode, "service");
      assert.equal(plan.route, "help");
      assert.equal(plan.helpRequest, request);
      assert.equal(plan.canContinue, true);
      assert.match(plan.nextAction, /separate acceptance/);
      assert.equal(createWorkspaceStartContinuation(plan), null);
    });
  }
  it("keeps the full mixed request for provider review", () => {
    const request = "Have Strelva build our website and create a staff request app.";
    const plan = planWorkspaceStart(request, nativeContext);
    assert.equal(plan.deliveryMode, "service");
    assert.equal(plan.request, request);
    assert.equal(plan.helpRequest, request);
  });
  for (const request of [
    "Create a website for my business.",
    "Generate a website myself.",
    "I don't want Strelva to build my website; let me create it myself.",
    "Create a website. Our supplier is Strelva.",
  ]) {
    it(`does not force agency delivery: ${request}`, () => {
      const plan = planWorkspaceStart(request, nativeContext);
      assert.notEqual(plan.deliveryMode, "service");
    });
  }
  it("routes a native app without a website or inquiry binding", () => {
    const context: WorkspaceStartContext = { products: [{ id: "applications", availability: "available" }] };
    const plan = planWorkspaceStart("Create a staff request app.", context);
    assert.equal(plan.route, "applications");
    assert.equal(plan.canContinue, true);
    assert.equal(createWorkspaceStartContinuation(plan)?.productId, "applications");
  });
  for (const request of [
    "Organize supplier onboarding requirements.",
    "Create onboarding requirements.",
    "Manage onboarding documents.",
  ]) {
    it(`opens native onboarding: ${request}`, () => {
      const context: WorkspaceStartContext = { products: [{ id: "onboarding", availability: "available" }] };
      const plan = planWorkspaceStart(request, context);
      assert.equal(plan.route, "onboarding");
      assert.equal(plan.productId, "onboarding");
      assert.equal(plan.canContinue, true);
      assert.equal(workspaceStartContinueLabel(plan), "Organize onboarding");
      assert.equal(createWorkspaceStartContinuation(plan)?.request, request);
    });
  }
  it("does not mistake an onboarding policy document for a case", () => {
    assert.equal(planWorkspaceStart("Draft an onboarding policy document.", nativeContext).route, "document");
  });
  it("does not expose an unavailable onboarding path", () => {
    const plan = planWorkspaceStart("Organize onboarding requirements.", { products: [] });
    assert.equal(plan.status, "blocked");
    assert.equal(plan.canContinue, false);
    assert.equal(createWorkspaceStartContinuation(plan), null);
  });
  it("does not expose an unmounted onboarding path", () => {
    const plan = planWorkspaceStart("Organize onboarding requirements.", { ...nativeContext, native: { onboarding: false } });
    assert.equal(plan.status, "blocked");
  });
  it("blocks provider entry for read-only context", () => {
    const plan = planWorkspaceStart("Have Strelva build our website.", { ...nativeContext, readOnly: true });
    assert.equal(plan.status, "blocked");
    assert.equal(plan.canContinue, false);
  });
  it("retains the request when provider review is unmounted", () => {
    const request = "Have Strelva build our website.";
    const plan = planWorkspaceStart(request, { ...nativeContext, native: { help: false } });
    assert.equal(plan.status, "blocked");
    assert.equal(plan.helpRequest, request);
  });
  it("preserves multiline brief text instead of rewriting it", () => {
    const request = "Have Strelva build our website.\nUse our supplied photos.\nDo not replace our booking link.";
    assert.equal(planWorkspaceStart(request, nativeContext).request, request);
  });
});

describe("continuation selection", () => {
  it("fills the only available inquiry business", () => {
    const plan = planWorkspaceStart("Handle customer inquiries.", nativeContext);
    assert.equal(createWorkspaceStartContinuation(plan)?.businessId, "business-a");
  });
  it("fills the only available managed site", () => {
    const plan = planWorkspaceStart("Improve our website.", nativeContext);
    assert.equal(createWorkspaceStartContinuation(plan)?.siteId, "site-a");
  });
  it("rejects a business outside current discovery", () => {
    const plan = planWorkspaceStart("Handle customer inquiries.", nativeContext);
    assert.equal(createWorkspaceStartContinuation(plan, plan.selectedPartIds, { businessId: "business-b" }), null);
  });
  it("rejects a website outside current discovery", () => {
    const plan = planWorkspaceStart("Improve our website.", nativeContext);
    assert.equal(createWorkspaceStartContinuation(plan, plan.selectedPartIds, { siteId: "site-b" }), null);
  });
  it("rejects an arbitrary template", () => {
    const plan = planWorkspaceStart("Import a CSV into a tracker.", nativeContext);
    assert.equal(createWorkspaceStartContinuation(plan, plan.selectedPartIds, { trackerTemplateId: "unknown" }), null);
  });
  it("preserves a permitted template", () => {
    const plan = planWorkspaceStart("Import a CSV into a tracker.", nativeContext);
    assert.equal(createWorkspaceStartContinuation(plan, plan.selectedPartIds, { trackerTemplateId: "tasks" })?.trackerTemplateId, "tasks");
  });
  it("requires explicit selection when multiple sites exist", () => {
    const context = { ...nativeContext, managedSites: [...nativeContext.managedSites!, { id: "site-b", title: "B" }] };
    const plan = planWorkspaceStart("Improve our website.", context);
    assert.equal(createWorkspaceStartContinuation(plan), null);
    assert.equal(createWorkspaceStartContinuation(plan, plan.selectedPartIds, { siteId: "site-b" })?.siteId, "site-b");
  });
  it("requires explicit selection when multiple inquiry businesses exist", () => {
    const context = { ...nativeContext, inquiryBusinesses: [...nativeContext.inquiryBusinesses!, { id: "business-b", title: "B" }] };
    const plan = planWorkspaceStart("Handle customer inquiries.", context);
    assert.equal(createWorkspaceStartContinuation(plan), null);
    assert.equal(createWorkspaceStartContinuation(plan, plan.selectedPartIds, { businessId: "business-b" })?.businessId, "business-b");
  });
  it("rechecks read-only state after a proposal was prepared", () => {
    const plan = planWorkspaceStart("Create a staff request app.", nativeContext);
    assert.equal(createWorkspaceStartContinuation(plan, plan.selectedPartIds, {}, { ...nativeContext, readOnly: true }), null);
  });
  it("rechecks product availability after a proposal was prepared", () => {
    const plan = planWorkspaceStart("Create a staff request app.", nativeContext);
    assert.equal(createWorkspaceStartContinuation(plan, plan.selectedPartIds, {}, { products: [] }), null);
  });
  it("rechecks selected website when discovery changes", () => {
    const plan = planWorkspaceStart("Improve our website.", nativeContext);
    assert.equal(createWorkspaceStartContinuation(plan, plan.selectedPartIds, { siteId: "site-a" }, { ...nativeContext, managedSites: [] }), null);
  });
  it("rejects a forged product id", () => {
    const plan = planWorkspaceStart("Create a staff request app.", nativeContext);
    assert.equal(createWorkspaceStartContinuation({ ...plan, productId: "websites" }), null);
  });
  it("rejects unrelated business scope carried into an app", () => {
    const plan = planWorkspaceStart("Create a staff request app.", nativeContext);
    assert.equal(createWorkspaceStartContinuation(plan, plan.selectedPartIds, { businessId: "business-a" }), null);
  });
  it("rejects unrelated website scope carried into onboarding", () => {
    const plan = planWorkspaceStart("Organize onboarding requirements.", nativeContext);
    assert.equal(createWorkspaceStartContinuation(plan, plan.selectedPartIds, { siteId: "site-a" }), null);
  });
  it("rejects a template on a different product", () => {
    const plan = planWorkspaceStart("Create a staff request app.", nativeContext);
    assert.equal(createWorkspaceStartContinuation(plan, plan.selectedPartIds, { trackerTemplateId: "tasks" }), null);
  });
  it("retains required-part checks", () => {
    const plan = planWorkspaceStart("Create a staff request app.", nativeContext);
    assert.equal(createWorkspaceStartContinuation(plan, []), null);
  });
  it("deduplicates selected parts", () => {
    const plan = planWorkspaceStart("Create a staff request app.", nativeContext);
    assert.deepEqual(createWorkspaceStartContinuation(plan, [...plan.selectedPartIds, ...plan.selectedPartIds])?.includedPartIds, plan.selectedPartIds);
  });
  it("does not execute a supported-looking help route", () => {
    const plan = planWorkspaceStart("Create a staff request app.", nativeContext);
    assert.equal(createWorkspaceStartContinuation({ ...plan, route: "help" }), null);
  });
  it("returns the current context rather than a stale snapshot", () => {
    const plan = planWorkspaceStart("Create a staff request app.", nativeContext);
    const current = { products: [{ id: "applications", availability: "available" as const }] };
    assert.equal(createWorkspaceStartContinuation(plan, plan.selectedPartIds, {}, current)?.context, current);
  });
});
