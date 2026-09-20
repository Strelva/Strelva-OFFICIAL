import { AgencyApplicationDraftExperience } from "@/experience/applications/AgencyApplicationDraftExperience";

export default async function AgencyApplicationDraftPage({ params }: { params: Promise<{ workId: string }> }) {
  return <AgencyApplicationDraftExperience workId={(await params).workId} />;
}

