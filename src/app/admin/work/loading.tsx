import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function Loading() { return <StPage><StHead title={OPERATOR_DESTINATIONS.work.label} meta="Reading recorded work and human minutes…" /><StSkeleton label="Reading internal work" /><StSkeleton width="70%" /></StPage>; }
