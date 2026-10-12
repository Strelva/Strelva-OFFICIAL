"use client";
import { StHead, StNotice, StPage, StTextButton } from "@/components/ui/strelva/Kit";
export default function ConversionError({ reset }: { reset: () => void }) { return <StPage><StHead title="Convert a client" /><StNotice tone="critical">Conversion records are unavailable. Any earlier action’s outcome must be read before trying again. <StTextButton onClick={reset}>Read saved state</StTextButton></StNotice></StPage>; }
