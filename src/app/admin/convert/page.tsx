import { randomUUID } from "node:crypto";
import { StEmpty, StField, StHead, StNotice, StPage, StPill, StRows, StRow, StSection, StTextButton } from "@/components/ui/strelva/Kit";
import { conversionReceiptSchema } from "@/platform/business-record/contracts";
import { conversionAdmission, conversionDependencies, rollbackDependencies, readConversionAgency } from "@/server/tenant-conversion/runtime";
import { admitConversion, applyReviewedConversion, applyReviewedRollback, conversionReleaseEnabled, conversionReviewDigest, conversionSelectionSchema, previewConversion, previewRollback, rollbackReviewDigest } from "@/server/tenant-conversion/review";
import { isLocalDatabaseUrl } from "@/server/tenant-conversion/engine";
import { readConversionSources } from "@/tenant-conversion-sources";
import { ConversionAction, type ConversionActionResult } from "./ConversionAction";

export const dynamic = "force-dynamic";
type Params = Record<string, string | string[] | undefined>;
const value = (params: Params, key: string) => typeof params[key] === "string" ? params[key] as string : "";

export default async function ConvertPage({ searchParams }: { searchParams: Promise<Params> }) {
  if (!conversionReleaseEnabled()) return <StPage><StHead title="Convert a client" /><StEmpty>Client conversion is not enabled. Existing client sites keep their current service.</StEmpty><StTextButton href="/admin/clients">Back to Sites</StTextButton></StPage>;
  try { await admitConversion(conversionAdmission); } catch { return <StPage><StHead title="Convert a client" /><StNotice tone="critical">A verified super-admin session is required. Development bypass grants no conversion authority.</StNotice><StTextButton href="/sign-in">Sign in</StTextButton></StPage>; }
  const params = await searchParams;
  const slug = value(params, "slug");
  const agency = value(params, "agency");
  const staff = value(params, "staff");
  const basis = value(params, "basis");
  const separate = value(params, "separate") === "on";
  const reviewedSource = value(params, "source") === "legacy";
  let content: React.ReactNode = null;
  const disabledReason = !isLocalDatabaseUrl(conversionAdmission.databaseUrl()) && !conversionAdmission.productionApproved() ? "Production writes are awaiting Jacob’s approval. This review writes nothing." : undefined;
  if (slug && reviewedSource) {
    try {
      const selection = conversionSelectionSchema.parse({ slug, agencyWorkspaceId: agency, agencyStaffEmails: staff.split(",").map(email => email.trim()).filter(Boolean), agencySelectionBasis: basis, separateBusiness: separate });
      const selectedAgency = await readConversionAgency(selection.agencyWorkspaceId);
      const { actor, outcome } = await previewConversion(selection, conversionAdmission, conversionDependencies(readConversionSources));
      const reviewed = { actorId: actor.userId, digest: conversionReviewDigest(outcome) };
      const { outcome: undo } = await previewRollback(slug, conversionAdmission, rollbackDependencies());
      const undoReview = { actorId: actor.userId, digest: rollbackReviewDigest(undo) };
      async function convert(): Promise<ConversionActionResult> {
        "use server";
        try { return { ok: true, receipt: await applyReviewedConversion(selection, reviewed, conversionAdmission, conversionDependencies(readConversionSources)) }; }
        catch { return { ok: false, message: "Conversion could not be confirmed. Access, approval, source records or destination may have changed. Read the saved state and run a new dry run." }; }
      }
      async function rollback(): Promise<ConversionActionResult> {
        "use server";
        try { return { ok: true, receipt: await applyReviewedRollback(slug, undoReview, conversionAdmission, rollbackDependencies()) }; }
        catch { return { ok: false, message: "Undo could not be confirmed. Read the saved state and review current eligibility again." }; }
      }
      const readId = randomUUID();
      const receipt = conversionReceiptSchema.safeParse(outcome.link?.link?.receipt);
      content = <>
        <StSection title="Review the dry run"><StNotice>Nothing was written. Imported facts are unverified. Booking availability stays in its existing store; this does not select a runtime source or qualify a cutover.</StNotice><StRows>
          <StRow title={outcome.plan.payload.workspaceName} detail={outcome.link?.link ? `Already linked to ${outcome.link.link.workspaceId}; conversion would write nothing.` : outcome.targetWorkspaceId ? `Join existing business ${outcome.targetWorkspaceId}` : "Create a business workspace"} />
          <StRow title="Agency access" detail={`${selectedAgency.name} (${selectedAgency.id}) · ${selection.agencyStaffEmails.join(", ")} · ${basis === "owner_choice" ? "Owner choice" : "Existing contract"}`} />
          <StRow title="Provider-seat access" detail="Named staff receive ordinary agency access. The operator gets no personal client membership. No owner invitation or email is sent." />
          <StRow title="Records to import" detail={`${outcome.plan.counts.facts} facts · ${outcome.plan.counts.services} services · ${outcome.plan.counts.people} people · ${outcome.plan.counts.contacts} contacts`} />
          <StRow title="Source coverage" detail={`${outcome.plan.counts.leadsRead} leads read (up to 500) · ${outcome.plan.counts.bookingsRead} bookings read · ${outcome.plan.counts.contactsSkipped} contacts skipped`} />
          <StRow title="Billing" detail="Billing and account grouping are captured for review. Stripe subscriptions and allowances stay unchanged." />
        </StRows>
        {outcome.plan.skipped.length > 0 && <StSection title="Skipped records"><StRows>{outcome.plan.skipped.map((item, index) => <StRow key={`${item.field}-${index}`} title={item.field} detail={item.reason} />)}</StRows></StSection>}
        <StSection title="Exact reviewed records"><pre className="overflow-auto whitespace-pre-wrap break-all text-sm">{JSON.stringify(outcome.plan.payload, null, 2)}</pre><p className="break-all text-sm">Source digest: {outcome.plan.digest}</p></StSection>
        {!outcome.link?.link && <ConversionAction key={`${reviewed.digest}-${readId}`} action={convert} label="Convert client" disabledReason={disabledReason} />}
        </StSection>
        {outcome.link?.link && <StSection title="Saved conversion receipt">{receipt.success ? <StRows><StRow title={receipt.data.workspaceName} detail={`Converted ${receipt.data.convertedAt} · Release ${receipt.data.revision} · operator ${receipt.data.operatorId}`} /><StRow title="Recorded agency" detail={receipt.data.providerRoute ? `${receipt.data.providerRoute.agencyWorkspaceId} · ${receipt.data.providerRoute.staff.map(person => person.email).join(", ")}` : "This older conversion has no recorded agency route. Repath its access before treating it as complete."} /></StRows> : <StNotice tone="need">The saved receipt cannot be read as a complete conversion receipt. The site remains linked; no new conversion is offered.</StNotice>}<pre className="overflow-auto whitespace-pre-wrap break-all text-sm">{JSON.stringify(outcome.link.link.receipt, null, 2)}</pre></StSection>}
        <StSection title="Undo eligibility">{undo.preview.plan ? <><StRows><StRow title="Imported records" detail={`${undo.preview.plan.entities.removed} removed · ${undo.preview.plan.entities.restored} restored · ${undo.preview.plan.entities.kept} kept because they changed`} /><StRow title="Business workspace" detail={undo.preview.plan.deleteWorkspace ? "Can be removed because this conversion created it and it has no other use." : `Will be kept: ${undo.preview.plan.workspaceKeptBecause.join(", ")}`} /><StRow title="Leads and Systems" detail={`${undo.preview.plan.leadsDetached} leads detached; lead rows stay. ${undo.preview.plan.systemsAdoptedFromTenant} adopted Systems stay in the business.`} /></StRows><StNotice>Undo preserves records changed after import. Tenant records, legacy keys, the v1 API, Stripe and email stay untouched.</StNotice><ConversionAction key={`${undoReview.digest}-${readId}`} action={rollback} label="Undo" disabledReason={disabledReason} /></> : <StEmpty>{undo.preview.lastUnlink ? `Last undone ${undo.preview.lastUnlink.unlinkedAt}. No linked conversion remains.` : "There is no linked conversion to undo."}</StEmpty>}</StSection>
      </>;
    } catch {
      content = <StNotice tone="critical">The dry run could not be read. Check the site, agency UUID, unique staff emails and selection basis. If a source or database is unavailable, restore it and run again. No changes were made.</StNotice>;
    }
  } else if (slug) content = <StNotice tone="need">Choose and acknowledge the legacy source before running the dry run.</StNotice>;
  return <StPage><StHead crumb={{ label: "Sites", href: "/admin/clients" }} title="Convert a client" meta="Dry run → review exact records → convert" />
    <StSection title="Choose the site and agency"><form method="get" className="flex flex-col gap-4">
      <StField label="Site slug"><input name="slug" required maxLength={120} defaultValue={slug} /></StField>
      <StField label="Agency workspace UUID" hint="Choose an ordinary agency, including Strelva Agency only when that is the recorded contract or owner choice. There is no default agency."><input name="agency" required defaultValue={agency} /></StField>
      <StField label="Agency staff emails" hint="Comma-separated, unique agency member emails. These people receive provider-seat access."><input name="staff" required defaultValue={staff} /></StField>
      <StField label="Why this agency?"><select name="basis" required defaultValue={basis}><option value="">Choose the recorded basis</option><option value="existing_contract">Existing contract</option><option value="owner_choice">Owner choice</option></select></StField>
      <StField label="Business grouping"><select name="separate" defaultValue={separate ? "on" : "off"}><option value="off">Join a converted sibling in the same multi-site account</option><option value="on">Make this site a separate business</option></select></StField>
      <StField label="Reviewed source" hint="Tenant row from Postgres, content from its configured store, leads and booking rows from their legacy stores, settings and account grouping from legacy Redis. No runtime source or cutover is selected."><select name="source" required defaultValue={reviewedSource ? "legacy" : ""}><option value="">Choose the source</option><option value="legacy">Use these explicit legacy records</option></select></StField>
      <StPill type="submit" variant="soft">Run dry run</StPill>
    </form></StSection>{content}
  </StPage>;
}
