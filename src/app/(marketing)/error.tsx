"use client";
import { StHead, StNotice, StPage, StPill } from "@/components/ui/strelva/Kit";

/**
 * Last-resort error boundary for the Strelva marketing tree. The marketing
 * pages are largely static, so this rarely fires — it exists so a render
 * failure degrades to a calm retry instead of the raw framework error screen.
 */
export default function MarketingError({ reset }: { error: Error; reset: () => void }) {
  return <StPage><StHead title="This page is temporarily unavailable" /><StNotice>We couldn’t load this page. Try again in a moment.</StNotice><StPill onClick={reset}>Try again</StPill></StPage>;
}
