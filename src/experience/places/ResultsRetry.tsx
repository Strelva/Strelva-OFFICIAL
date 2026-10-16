"use client";

import { XaButton } from "@/components/ui/strelva/Xa";

/** Preserve the complete selected window when retrying a failed read. */
export function ResultsRetry() {
  return <XaButton onClick={() => window.location.reload()}>Reload results</XaButton>;
}
