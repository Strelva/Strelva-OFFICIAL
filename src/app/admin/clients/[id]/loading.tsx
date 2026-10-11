import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function Loading() { return <StPage><StHead crumb={{ label: OPERATOR_DESTINATIONS.sites.label, href: "/admin/clients" }} title="Reading site…" /><StSkeleton label="Reading site release settings" /><StSkeleton width="60%" /></StPage>; }
