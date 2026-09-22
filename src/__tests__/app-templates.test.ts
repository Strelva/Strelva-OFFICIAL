import { describe, expect, it } from "vitest";
import { APP_TEMPLATES, addDraftField, removeDraftField, templateDraft, validateApplicationDraft } from "@/experience/applications/app-templates";
import { onboardingRequestPrefill } from "@/products/onboarding/request-prefill";

describe("native app templates", () => {
  it("keeps every curated template valid and independently editable", () => {
    for (const template of APP_TEMPLATES) {
      const draft = templateDraft(template);
      expect(validateApplicationDraft(draft)).toBeNull();
      draft.fields[0]!.label = "Changed";
      expect(template.fields[0]!.label).not.toBe("Changed");
      expect(draft).not.toHaveProperty("maintenanceOwner");
    }
  });
  it("preserves stable field references when adding and removing", () => {
    const initial = templateDraft(APP_TEMPLATES[0]!);
    const added = addDraftField(initial);
    const field = added.fields.at(-1)!;
    expect(added.components.every(component => component.fields.includes(field.id))).toBe(true);
    const removed = removeDraftField(added, field.id);
    expect(removed).toEqual(initial);
    expect(validateApplicationDraft(removed)).toBeNull();
  });
  it("never removes the last field", () => {
    let draft = templateDraft(APP_TEMPLATES[0]!);
    while (draft.fields.length > 1) draft = removeDraftField(draft, draft.fields[0]!.id);
    expect(removeDraftField(draft, draft.fields[0]!.id)).toEqual(draft);
  });
  it("rejects incomplete choices before creation", () => {
    const draft = templateDraft(APP_TEMPLATES[0]!);
    const field = draft.fields.find(item => item.type === "select")!;
    if (field.type === "select") field.options = [""];
    expect(validateApplicationDraft(draft)).not.toBeNull();
  });
});
describe("onboarding request continuity", () => {
  it("carries an explicit sentence into editable requirements without breaking compound names", () => {
    expect(onboardingRequestPrefill("Organize supplier onboarding. We need an insurance certificate and a signed agreement.")).toEqual({ subjectType: "supplier", requirementsText: "an insurance certificate\na signed agreement" });
    expect(onboardingRequestPrefill("Organize employee onboarding. We need a health and safety policy.").requirementsText).toBe("a health and safety policy");
    expect(onboardingRequestPrefill("We need no additional documents.").requirementsText).toBe("");
  });
  it("retains explicit supplier context and literal checklist lines", () => {
    expect(onboardingRequestPrefill("Organize supplier onboarding.\n- Insurance certificate\n- Signed agreement")).toEqual({ subjectType: "supplier", requirementsText: "Insurance certificate\nSigned agreement" });
  });
  it("does not invent requirements from an ambiguous request", () => {
    expect(onboardingRequestPrefill("Organize employee onboarding")).toEqual({ subjectType: "employee", requirementsText: "" });
  });
});
