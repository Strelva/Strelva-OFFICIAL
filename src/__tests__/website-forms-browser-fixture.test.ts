import { expect, it } from "vitest";
import { websiteSchema, websiteCapabilityOptionsSchema } from "@/products/websites/contracts";
import { websiteRebuildSchema } from "@/products/websites/rebuild-contracts";
import { formsRecord, formOptions } from "../../tests/support/website-forms-browser-fixture";

it.each([1, 2] as const)("browser fixture v%s supplies valid approved and reconciled native envelopes", version => {
  const before = formsRecord(version), after = formsRecord(version, 2, false);
  const parse = (value: ReturnType<typeof formsRecord>) => "rebuild" in value ? websiteRebuildSchema.parse(value.rebuild) : websiteSchema.parse(value.website);
  const initial = parse(before), current = parse(after);
  expect(initial.approvedCandidateRevision).toBe(initial.candidate?.revision);
  expect(current.approvedCandidateRevision).toBeNull();
  expect(current.revision).toBe(initial.revision + 1);
  expect(current.publishedCapabilitySelection?.inquiryCapabilityId).toBe("catering");
  const options = websiteCapabilityOptionsSchema.parse(formOptions);
  expect(options.tenants[0]?.inquiry.some(form => form.capabilityId === current.publishedCapabilitySelection?.inquiryCapabilityId)).toBe(true);
});
