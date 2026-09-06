import { describe, expect, it } from "vitest";
import {
  AI_VISIBILITY_ASSESSMENT_RESOURCE_KIND,
  AI_VISIBILITY_PRIVATE_WORK_RESOURCE_KIND,
  aiVisibilityAssessmentPayloadSchema,
  parseAiVisibilityAssessmentPayload,
} from "@/products/ai-visibility/client";
import {
  getWorkspaceWorkPresentation,
  presentWorkspaceWork,
  WORK_PRESENTATION_REGISTRY,
} from "@/experience/workspace/result";
import { getProductDefinition, listConsumerProducts } from "@/platform/products";

const payload = {
  business: "Harbor Dental",
  url: "https://harbor.example",
  score: 82,
  grade: "B" as const,
  verdict: "AI can understand the business.",
  topFix: "Keep the facts current.",
  measurementStatus: "measured" as const,
  readinessMeasured: true,
  measurementNote: "Measured.",
  signals: [{ id: "identity", label: "Identity", pass: true, detail: "Clear.", weight: 20 }],
  citation: { probed: true, mentioned: true, recommended: true, note: "Named." },
};

describe("product-owned workspace work contracts", () => {
  it("parses the supported payload and strips fields outside the renderer contract", () => {
    const parsed = parseAiVisibilityAssessmentPayload({ ...payload, privateSecret: "not for the browser" });
    expect(parsed).toEqual(payload);
    expect(parsed).not.toHaveProperty("privateSecret");
    expect(aiVisibilityAssessmentPayloadSchema.safeParse(payload).success).toBe(true);
    expect(parseAiVisibilityAssessmentPayload({ ...payload, signals: "invalid" })).toBeNull();
  });

  it("dispatches only the static registry and keeps both private wire ids readable", () => {
    expect(WORK_PRESENTATION_REGISTRY).toHaveLength(1);
    expect(getWorkspaceWorkPresentation("ai_visibility", AI_VISIBILITY_ASSESSMENT_RESOURCE_KIND)).not.toBeNull();
    expect(getWorkspaceWorkPresentation("ai_visibility", AI_VISIBILITY_PRIVATE_WORK_RESOURCE_KIND)).not.toBeNull();
    expect(getWorkspaceWorkPresentation("future_product", "future_result")).toBeNull();

    for (const resourceKind of [AI_VISIBILITY_ASSESSMENT_RESOURCE_KIND, AI_VISIBILITY_PRIVATE_WORK_RESOURCE_KIND]) {
      const work = presentWorkspaceWork({
        id: "saved",
        workspaceId: "personal",
        productId: "ai_visibility",
        resourceKind,
        payload,
        createdBy: "actor",
        createdAt: "today",
        updatedAt: "today",
      });
      expect(work.payload).toEqual(payload);
      expect(work.title).toBe("Harbor Dental");
    }
  });

  it("keeps internal monitoring and disabled Homefinder out of consumer discovery", () => {
    expect(listConsumerProducts().map((product) => product.id)).toEqual(["ai_visibility", "managed_presence"]);
    expect(getProductDefinition("managed_presence").name).toBe("Managed Websites");
    expect(getProductDefinition("ai_visibility").resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: AI_VISIBILITY_PRIVATE_WORK_RESOURCE_KIND, compatibilityKinds: [AI_VISIBILITY_ASSESSMENT_RESOURCE_KIND] }),
    ]));
    expect(getProductDefinition("domain_monitoring").release.availability).toBe("managed_internal");
    expect(getProductDefinition("homefinder").release.availability).toBe("not_enabled");
  });
});
