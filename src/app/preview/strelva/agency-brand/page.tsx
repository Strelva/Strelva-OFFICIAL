import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { AgencyBrandFixture } from "@/experience/workspace/agency/AgencyBrandFixture";
import { STRELVA_BRAND } from "@/platform/infra/agency-brand";
export default function AgencyBrandPreview() {
  if (!strelvaUiPreviewEnabled()) notFound();
  const brand = { ...STRELVA_BRAND, agencyId: "b2640000-0000-4000-8000-000000000010", name: "Northside & Web — a very long agency name for reflow", accentColor: "#ffff00", replyTo: "reply@north.example" };
  return <StrelvaShell ownerBrand={brand} title="Needs you" signedIn={false} needsYou={{ count: 1 }}><AgencyBrandFixture brand={brand} /></StrelvaShell>;
}
