"use client";
import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { StHead, StNotice, StPage, StPill } from "@/components/ui/strelva/Kit";
export default function Error({ reset }: { reset: () => void }) { return <StPage><StHead title={OPERATOR_DESTINATIONS.health.label} /><StNotice tone="critical">This page could not be read. The latest records are unconfirmed.</StNotice><StPill variant="soft" onClick={reset}>Try again</StPill></StPage>; }
