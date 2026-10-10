"use client";

import { StTextButton } from "@/components/ui/strelva/Kit";

/** Preserve the complete selected window when retrying a failed read. */
export function ResultsRetry() {
  return <StTextButton onClick={() => window.location.reload()}>Reload results</StTextButton>;
}
