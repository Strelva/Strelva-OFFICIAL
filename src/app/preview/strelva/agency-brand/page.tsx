import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { AgencyBrandFixture } from "@/experience/workspace/agency/AgencyBrandFixture";
import { STRELVA_BRAND } from "@/platform/infra/agency-brand";
export default function AgencyBrandPreview() {
  if (!strelvaUiPreviewEnabled()) notFound();
  const brand = { ...STRELVA_BRAND, agencyId: "b2640000-0000-4000-8000-000000000010", name: "Northside & Web — a very long agency name for reflow", accentColor: "#ffff00", replyTo: "reply@north.example" };
  return <StrelvaShell ownerBrand={brand} workspaceName={brand.name} title="Brand" signedIn signOut={null} accountName="Agency owner" accountDetail="Fictional preview" active="settings" agencyNavigation={{ hrefs: { clients: "/preview/strelva/agency-portfolio", queue: "/preview/strelva/agency-portfolio?surface=queue", library: "/preview/strelva/agency-library", team: "/preview/strelva/agency-people?surface=team" } }}><AgencyBrandFixture brand={brand} /></StrelvaShell>;
}
