import { StEmpty, StHead, StNotice, StPage, StRow, StRows, StSection, StTextButton } from "@/components/ui/strelva/Kit";
import { OperationalInbox } from "@/experience/operations/OperationalInbox";
import { ServiceRequestInbox } from "@/experience/operations/ServiceRequestInbox";
import { BusinessEffortPortfolio } from "./BusinessEffort";
import type { BusinessEffortLoad } from "./effort-data";

type SurfaceLink = {
  href: string;
  label: string;
  detail: string;
};

function SurfaceLinks({ links }: { links: SurfaceLink[] }) {
  return <StRows>{links.map(link => <StRow key={link.href} href={link.href} title={link.label} detail={link.detail} />)}</StRows>;
}

export function InternalWorkView({ effort, workspaceOpen, learningOpen, operationsHref, learningHref, preview = false }: { effort: BusinessEffortLoad; workspaceOpen: boolean; learningOpen: boolean; operationsHref: string; learningHref: string; preview?: boolean }) {
  return <StPage>
    <StHead title="Internal work" meta="Open the existing surface that owns the work. This console remains restricted to super admins." />
    <StSection title="Staff delivery entry">
      <StNotice>Strelva staff use the exact assignment link for one owner-approved job. Assignment scope, expiry, acceptance, and permission are checked again before work runs.</StNotice>
    </StSection>
    <BusinessEffortPortfolio load={effort} readOnly={preview} />
    <StSection title="Pre-installation service requests"><ServiceRequestInbox /></StSection>
    <StSection title="Execution exceptions and assignments" meta="Accepted or unknown effects are never replayed.">
      {preview ? <StEmpty>Recorded exceptions and assignments appear here after an authorized read.</StEmpty> : <OperationalInbox mode="internal" />}
    </StSection>
    <StSection title="Managed-site delivery">
      <SurfaceLinks links={[
        { href: "/admin/websites", label: "Rebuild a website", detail: "Read an existing site, prepare a private preview and send its decisions to the owner." },
        { href: "/admin/actions", label: "Managed-site work", detail: "Review ready opportunities and pending governed actions for existing managed clients." },
        { href: "/admin/drafts", label: "Drafts", detail: "Inspect drafts that have not been published." },
        { href: "/admin/digests", label: "Maintenance", detail: "Review pending maintenance digests." },
      ]} />
    </StSection>
    <StSection title="Support"><SurfaceLinks links={[
      { href: "/admin/clients", label: "Clients", detail: "Open the current client record, site health, access, and delivery controls." },
      { href: "/admin/accounts", label: "Accounts", detail: "Inspect client and payer groupings across managed sites." },
      { href: "/admin/leads", label: "Leads", detail: "Work received requests without treating them as accepted delivery." },
    ]} /></StSection>
    <StSection title="Offering development">
      {learningOpen ? <StRows><StRow href={learningHref} title="Open internal product learning" detail="Use saved sources, evidence, decisions, builds, and outcomes in the existing research surface." /></StRows>
        : <StEmpty>Internal product learning is not enabled here. It remains a local R&amp;D surface and does not establish a released offering.</StEmpty>}
    </StSection>
    <StSection title="Operating costs">
      {workspaceOpen ? <StRows><StRow href={operationsHref} title="Open ongoing work" detail="Inspect the approved budget and recorded usage on the exact job. There is no unsupported portfolio cost total." /></StRows>
        : <StEmpty>Work budgets are unavailable while the workspace release is off. Existing billing and managed-client agreements are unchanged.</StEmpty>}
    </StSection>
    <StSection title="Restricted system administration"><SurfaceLinks links={[
      { href: "/admin/ops", label: "Operations", detail: "Inspect operational failures and supported recovery controls." },
      { href: "/admin/uptime", label: "Uptime", detail: "Inspect current monitored host results." },
      { href: "/admin/audit", label: "Audit", detail: "Inspect current site-audit records." },
    ]} /></StSection>
    <StTextButton href="/admin/queue">Back to queue</StTextButton>
  </StPage>;
}
