"use client";

import { useMemo } from "react";
import { createPreviewInquiryAdapter } from "./preview-fixture";
import { InquiryExperience, type InquiryExperienceProps } from "./InquiryExperience";

export type InquiryPreviewExperienceProps = Omit<InquiryExperienceProps, "adapter" | "initialSnapshot"> & {
  adapter?: InquiryExperienceProps["adapter"];
};

/** Preview-only composition. Production entry points do not import this module. */
export function InquiryPreviewExperience({ adapter, audience = "business", scenario, ...props }: InquiryPreviewExperienceProps) {
  const previewAdapter = useMemo(
    () => adapter || createPreviewInquiryAdapter(audience, scenario),
    [adapter, audience, scenario],
  );
  return <InquiryExperience {...props} audience={audience} scenario={scenario} adapter={previewAdapter} />;
}
