"use client";
import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { StHead, StNotice, StPage, StPill } from "@/components/ui/strelva/Kit";
export default function Error({ reset }: { reset: () => void }) { return <StPage><StHead title={OPERATOR_DESTINATIONS.checks.label} /><StNotice tone="critical">Site checks could not be read. No site has been marked healthy.</StNotice><StPill variant="soft" onClick={reset}>Try again</StPill></StPage>; }
