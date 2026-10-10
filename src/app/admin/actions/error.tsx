"use client";
import { StHead, StNotice, StPage, StPill } from "@/components/ui/strelva/Kit";
export default function Error({ reset }: { reset: () => void }) { return <StPage><StHead title="Portfolio actions" /><StNotice tone="critical">This view could not be read. No empty or clear state has been confirmed.</StNotice><StPill variant="soft" onClick={reset}>Try again</StPill></StPage>; }
