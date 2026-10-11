import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function Loading() { return <StPage><StHead title={OPERATOR_DESTINATIONS.payLinks.label} /><StSkeleton label="Loading Strelva Agency payment links" /></StPage>; }
