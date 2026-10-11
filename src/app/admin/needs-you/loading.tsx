import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function Loading() { return <StPage><StHead title={OPERATOR_DESTINATIONS.policy.label} meta="Reading decision settings…" /><StSkeleton label="Reading businesses and their settings" /><StSkeleton width="70%" /></StPage>; }
