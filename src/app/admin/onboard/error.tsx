"use client";
import { StHead, StNotice, StPage, StTextButton } from "@/components/ui/strelva/Kit";
export default function Error({ reset }: { reset: () => void }) { return <StPage><StHead title="Onboard a client" /><StNotice tone="critical" action={<StTextButton onClick={reset}>Try again</StTextButton>}>This page could not be read. Check your connection and operator access.</StNotice></StPage>; }
