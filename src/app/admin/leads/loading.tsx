import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function Loading() { return <StPage><StHead title={OPERATOR_DESTINATIONS.prospects.label} meta="Reading Strelva Agency prospects…" /><StSkeleton label="Reading Strelva Agency prospects…" /><StSkeleton width="70%" /></StPage>; }
