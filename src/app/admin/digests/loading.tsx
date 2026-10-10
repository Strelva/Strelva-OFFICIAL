import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function Loading() { return <StPage><StHead title="Maintenance digests" meta="Reading proposed upkeep…" /><StSkeleton label="Reading proposed upkeep…" /><StSkeleton width="70%" /></StPage>; }
