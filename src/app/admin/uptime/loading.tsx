import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function Loading() { return <StPage><StHead title="Checks" meta="Reading checks across every client site…" /><StSkeleton label="Reading site checks" /><StSkeleton width="70%" /></StPage>; }
