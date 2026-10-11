import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function Loading() { return <StPage><StHead title={OPERATOR_DESTINATIONS.actions.label} meta="Checking Strelva Agency membership…" /><StSkeleton label="Checking Strelva Agency membership…" /><StSkeleton width="70%" /></StPage>; }
