import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function Loading() { return <StPage><StHead title={OPERATOR_DESTINATIONS.drafts.label} meta="Reading proposed content changes…" /><StSkeleton label="Reading proposed content changes…" /><StSkeleton width="70%" /></StPage>; }
