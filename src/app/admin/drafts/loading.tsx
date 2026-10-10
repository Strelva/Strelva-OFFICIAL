import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function Loading() { return <StPage><StHead title="Pending drafts" meta="Reading proposed content changes…" /><StSkeleton label="Reading proposed content changes…" /><StSkeleton width="70%" /></StPage>; }
