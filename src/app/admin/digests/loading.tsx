import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function Loading() { return <StPage><StHead title={OPERATOR_DESTINATIONS.maintenance.label} meta="Reading proposed upkeep…" /><StSkeleton label="Reading proposed upkeep…" /><StSkeleton width="70%" /></StPage>; }
