"use client";
import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { StHead, StNotice, StPage, StPill } from "@/components/ui/strelva/Kit";
export default function Error({ reset }: { reset: () => void }) { return <StPage><StHead title={OPERATOR_DESTINATIONS.maintenance.label} /><StNotice tone="critical">This view could not be read. No empty or clear state has been confirmed.</StNotice><StPill variant="soft" onClick={reset}>Try again</StPill></StPage>; }
