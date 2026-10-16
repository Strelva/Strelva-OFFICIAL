"use client";

import { XaButton } from "@/components/ui/strelva/Xa";

/** After a failed read: reload the page, which keeps the complete selected window in its address. */
export function ResultsRetry({ reload = () => window.location.reload() }: { reload?: () => void }) {
  return <XaButton variant="primary" onClick={reload}>Try again</XaButton>;
}
