import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
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
    <StHead title={OPERATOR_DESTINATIONS.work.label} meta="Open the existing surface that owns the work. This console remains restricted to super admins." />
    <StSection title="Staff delivery entry">
      <StNotice>Strelva staff use the exact assignment link for one owner-approved job. Assignment scope, expiry, acceptance, and permission are checked again before work runs.</StNotice>
    </StSection>
    <BusinessEffortPortfolio load={effort} readOnly={preview} />
    <StSection title="Pre-installation service requests"><ServiceRequestInbox /></StSection>
    <StSection title="Execution exceptions and assignments" meta="Accepted or unknown effects are never replayed.">
      {preview ? <StEmpty>Recorded exceptions and assignments appear here after an authorized read.</StEmpty> : <OperationalInbox mode="internal" />}
    </StSection>
    <StSection title="Strelva Agency work">
      <SurfaceLinks links={[
        { href: "/admin/websites", label: OPERATOR_DESTINATIONS.websites.label, detail: "Read an existing site, prepare a private preview and send its decisions to the owner." },
        { href: "/admin/actions", label: OPERATOR_DESTINATIONS.actions.label, detail: "Open Strelva Agency’s Queue through the ordinary agency seat." },
        { href: "/admin/drafts", label: OPERATOR_DESTINATIONS.drafts.label, detail: "Inspect drafts that have not been published." },
        { href: "/admin/digests", label: OPERATOR_DESTINATIONS.maintenance.label, detail: "Review pending maintenance digests." },
      ]} />
    </StSection>
    <StSection title="Support"><SurfaceLinks links={[
      { href: "/admin/clients", label: OPERATOR_DESTINATIONS.sites.label, detail: "Open site support records, site health and access controls." },
      { href: "/admin/accounts", label: OPERATOR_DESTINATIONS.billingGroups.label, detail: "Inspect payer groupings across sites; these do not define client businesses." },
      { href: "/admin/leads", label: OPERATOR_DESTINATIONS.prospects.label, detail: "Strelva Agency’s prospective clients; requests are not accepted delivery." },
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
      { href: "/admin/ops", label: OPERATOR_DESTINATIONS.health.label, detail: "Inspect operational failures and supported recovery controls." },
      { href: "/admin/uptime", label: OPERATOR_DESTINATIONS.checks.label, detail: "Inspect current monitored host results." },
      { href: "/admin/audit", label: OPERATOR_DESTINATIONS.audits.label, detail: "Inspect current site-audit records." },
    ]} /></StSection>
    <StTextButton href="/admin/queue">Back to queue</StTextButton>
  </StPage>;
}
