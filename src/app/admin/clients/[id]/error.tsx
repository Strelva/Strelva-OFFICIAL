"use client";
import { StHead, StNotice, StPage, StPill } from "@/components/ui/strelva/Kit";
export default function Error({ reset }: { reset: () => void }) { return <StPage><StHead crumb={{ label: "Clients", href: "/admin/clients" }} title="Client could not be read" /><StNotice tone="critical">The client record is unavailable. No release setting has changed.</StNotice><StPill variant="soft" onClick={reset}>Try again</StPill></StPage>; }
