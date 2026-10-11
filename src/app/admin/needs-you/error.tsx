"use client";
import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { StHead, StNotice, StPage, StPill } from "@/components/ui/strelva/Kit";
export default function Error({ reset }: { reset: () => void }) { return <StPage><StHead title={OPERATOR_DESTINATIONS.policy.label} /><StNotice tone="critical"><span role="alert">Decision settings could not be read. The latest settings are unconfirmed.</span></StNotice><StPill variant="soft" onClick={reset}>Try again</StPill></StPage>; }
