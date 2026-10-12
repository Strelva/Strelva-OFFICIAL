import { agencySignupReleaseEnabled } from "@/platform/agency-signup-release";
import { isSuperAdmin } from "@/platform/infra/auth";
import { redirect } from "next/navigation";
import { StHead, StNotice, StPage } from "@/components/ui/strelva/Kit";
import { AgencyQualificationDesk } from "./AgencyQualificationDesk";

export const dynamic = "force-dynamic";
export default async function QualificationPage() {
  if (!(await isSuperAdmin())) redirect("/sign-in");
  return <StPage><StHead crumb={{ label: "Operator desk", href: "/admin" }} title="Review agency evidence" meta="Decide which effects an agency may use. Client content and owner decisions stay with the business." />
    {agencySignupReleaseEnabled() ? <AgencyQualificationDesk /> : <StNotice>Agency qualification is coming soon. No availability can be changed while agency signup is closed.</StNotice>}
  </StPage>;
}
