import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function Loading() { return <StPage><StHead title="Operational health" meta="Reading service checks…" /><StSkeleton label="Reading service checks…" /><StSkeleton width="70%" /></StPage>; }
