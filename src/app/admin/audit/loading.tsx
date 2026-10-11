import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function Loading() { return <StPage><StHead title={OPERATOR_DESTINATIONS.audits.label} meta="Reading site checks and operator activity…" /><StSkeleton label="Reading site checks and operator activity…" /><StSkeleton width="70%" /></StPage>; }
