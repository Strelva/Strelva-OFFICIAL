import { describe, expect, it } from "vitest";
import { nativePublicWebsiteInput } from "@/experience/workspace/native-public-website";
import type { PublicContinuation } from "@/lib/public-continuation";

const brief: PublicContinuation = { version: 1, id: "11111111-1111-4111-8111-111111111111", businessName: "Harbor Dental", request: "Explain appointment requests.", result: "Families know the next step.", resultTitle: "Appointment path", scope: "A homepage reviewed before publication.", review: true, fileNames: ["private.pdf"] };
describe("public native website input", () => {
  it("retains request, desired result, scope and deterministic identity without inventing uploaded file contents", () => {
    const input = nativePublicWebsiteInput(brief, "workspace", `public-website-${brief.id}`);
    expect(input).toEqual({ workspaceId: "workspace", requestId: `public-website-${brief.id}`, businessName: brief.businessName, description: `${brief.request}\n\nDesired result: ${brief.result}\n\nScope: ${brief.scope}\n\nPrimary call to action: Contact us` });
    expect(input.description).not.toContain("private.pdf");
    expect(nativePublicWebsiteInput(brief, "workspace", input.requestId)).toEqual(input);
  });
  it("refuses an otherwise valid public brief that exceeds native input capacity without truncation", () => {
    expect(() => nativePublicWebsiteInput({ ...brief, request: "r".repeat(2_000), result: "s".repeat(2_000), scope: "t".repeat(1_000) }, "workspace", "request")).toThrow("Save the private brief");
  });
});
