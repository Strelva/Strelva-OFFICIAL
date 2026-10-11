"use client";
import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { StHead, StNotice, StPage, StPill } from "@/components/ui/strelva/Kit";
export default function Error({ reset }: { reset: () => void }) { return <StPage><StHead crumb={{ label: OPERATOR_DESTINATIONS.sites.label, href: "/admin/clients" }} title="Site could not be read" /><StNotice tone="critical">The site record is unavailable. No release setting has changed.</StNotice><StPill variant="soft" onClick={reset}>Try again</StPill></StPage>; }
