import { AgencyManagedWebsiteDraftExperience } from "@/experience/agency-website/AgencyManagedWebsiteDraftExperience";

export default async function AgencyManagedWebsiteDraftPage({ params }: { params: Promise<{ bindingId: string }> }) {
  return <AgencyManagedWebsiteDraftExperience bindingId={(await params).bindingId} />;
}
