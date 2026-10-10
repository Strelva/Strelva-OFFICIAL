"use client";
import { StHead, StNotice, StPage, StPill } from "@/components/ui/strelva/Kit";
export default function Error({ reset }: { reset: () => void }) { return <StPage><StHead title="Internal work" /><StNotice tone="critical"><span role="alert">Internal work could not be read. The latest work and minutes are unconfirmed.</span></StNotice><StPill variant="soft" onClick={reset}>Try again</StPill></StPage>; }
