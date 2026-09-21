import { describe, expect, it } from "vitest";
import { offeringRetryFromConflict, preserveOfferingDraftOnConflict } from "@/experience/workspace/offering-recovery";

describe("offering conflict recovery", () => {
  it("keeps editor B's draft while moving its retry to editor A's revision", () => {
    const editorB = preserveOfferingDraftOnConflict(
      { displayName: "Front desk requests", instructions: "Call the shift lead." },
      {
        attemptedRevision: 1,
        authoritativeRevision: 2,
        message: "This offering changed while you were editing.",
      },
    );

    expect(editorB.draft).toEqual({ displayName: "Front desk requests", instructions: "Call the shift lead." });
    expect(offeringRetryFromConflict(editorB)).toEqual({
      draft: { displayName: "Front desk requests", instructions: "Call the shift lead." },
      expectedRevision: 2,
    });
  });

  it("does not invent a retry revision before the authoritative refresh returns", () => {
    const review = preserveOfferingDraftOnConflict({ displayName: "Keep this" }, {
      attemptedRevision: 1,
      message: "The offering changed.",
    });

    expect(offeringRetryFromConflict(review)).toBeNull();
  });
});
