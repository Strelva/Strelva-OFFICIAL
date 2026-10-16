"use client";
import { XaPageBroke } from "@/experience/states/XaStates";

/**
 * Last-resort error boundary for the Strelva marketing tree. The marketing
 * pages are largely static, so this rarely fires. It exists so a render
 * failure degrades to a calm retry instead of the raw framework error screen.
 */
export default function MarketingError({ reset }: { error: Error; reset: () => void }) {
  return <XaPageBroke onRetry={reset} />;
}
