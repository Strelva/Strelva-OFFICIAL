import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function Loading() { return <StPage><StHead title="Site audits" meta="Reading client checks and operator activity…" /><StSkeleton label="Reading client checks and operator activity…" /><StSkeleton width="70%" /></StPage>; }
