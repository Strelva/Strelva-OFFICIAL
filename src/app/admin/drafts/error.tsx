"use client";
import { StHead, StNotice, StPage, StPill } from "@/components/ui/strelva/Kit";
export default function Error({ reset }: { reset: () => void }) { return <StPage><StHead title="Pending drafts" /><StNotice tone="critical">This page could not be read. The latest records are unconfirmed.</StNotice><StPill variant="soft" onClick={reset}>Try again</StPill></StPage>; }
