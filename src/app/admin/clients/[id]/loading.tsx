import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function Loading() { return <StPage><StHead crumb={{ label: "Clients", href: "/admin/clients" }} title="Reading client…" /><StSkeleton label="Reading client release settings" /><StSkeleton width="60%" /></StPage>; }
