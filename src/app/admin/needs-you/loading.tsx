import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function Loading() { return <StPage><StHead title="Who decides" meta="Reading decision settings…" /><StSkeleton label="Reading businesses and their settings" /><StSkeleton width="70%" /></StPage>; }
