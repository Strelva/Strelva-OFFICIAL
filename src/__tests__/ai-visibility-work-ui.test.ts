import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import {
  AiVisibilityPage,
  AiVisibilityAssessmentForm,
  AiVisibilityAssessmentResult,
  type AiVisibilityAssessmentWork,
} from "@/products/ai-visibility";
import { presentWorkspaceWork } from "@/experience/workspace/result";

const result = {
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

const work: AiVisibilityAssessmentWork = {
  productId: "ai_visibility",
  title: "Harbor Dental",
  payload: result,
  createdAt: "2026-09-06T00:00:00Z",
};

describe("AI Visibility workspace UI entry", () => {
  it("gives the public first-use form labels that survive placeholder changes", () => {
    const html = renderToStaticMarkup(createElement(AiVisibilityPage));

    expect(html).toContain("Business name");
    expect(html).toContain("Website");
    expect(html).toContain("Business category");
    expect(html).toContain("City and state");
  });

  it("exports a host-callback form without coupling it to workspace routes", () => {
    const html = renderToStaticMarkup(
      createElement(AiVisibilityAssessmentForm, {
        onSubmit: async () => work,
        onCreated: () => undefined,
      }),
    );
    expect(html).toContain("See what AI can understand about this business.");
    expect(html).toContain("Run assessment");
    expect(html).toContain("Saved only after completion");
  });

  it("renders only the product result fields and never raw saved payload fields", () => {
    const html = renderToStaticMarkup(
      createElement(AiVisibilityAssessmentResult, {
        work: { ...work, payload: { ...result, privateSecret: "must not render" } as typeof result },
        accessLabel: "Read-only access granted by the customer",
      }),
    );
    expect(html).toContain("Harbor Dental");
    expect(html).toContain("Read-only access granted by the customer");
    expect(html).not.toContain("must not render");
  });

  it("keeps unsupported work bounded to an unavailable state", () => {
    const html = renderToStaticMarkup(
      createElement(AiVisibilityAssessmentResult, {
        work: {
          ...work,
          productId: "future_product",
          title: "Future work",
          payload: null,
          unavailableReason: "This product view is not available yet.",
        },
      }),
    );
    expect(html).toContain("This saved work cannot be displayed here.");
    expect(html).toContain("This product view is not available yet.");
    expect(html).not.toContain("Harbor Dental");
  });

  it("strips unknown saved input before a work record reaches the browser", () => {
    const presented = presentWorkspaceWork({
      id: "saved",
      workspaceId: "workspace",
      productId: "ai_visibility",
      resourceKind: "ai_visibility_assessment",
      payload: { ...result, privateSecret: "must not reach the browser" },
      input: { business: "Harbor Dental", category: "Dentist", privateSecret: "must not reach the browser" },
      createdBy: "actor",
      createdAt: "today",
      updatedAt: "today",
    });
    expect(presented.input).toEqual({ business: "Harbor Dental", category: "Dentist" });
    expect(presented.payload).not.toHaveProperty("privateSecret");
  });
});
