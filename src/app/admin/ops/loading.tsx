import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function Loading() { return <StPage><StHead title={OPERATOR_DESTINATIONS.health.label} meta="Reading service checks…" /><StSkeleton label="Reading service checks…" /><StSkeleton width="70%" /></StPage>; }
