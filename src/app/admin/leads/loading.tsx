import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function Loading() { return <StPage><StHead title="Leads" meta="Reading site requests…" /><StSkeleton label="Reading site requests…" /><StSkeleton width="70%" /></StPage>; }
