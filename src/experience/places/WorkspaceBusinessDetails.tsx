import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { RecordPublishingFields } from "@/experience/publishing/RecordPublishingFields";
import type { RecordGoogleSummary } from "@/products/publishing/record-changes";
import type { BusinessRecord } from "@/platform/business-record/contracts";
import { DETAIL_LABELS, detailText, detailsWriteSource, type EditableDetail } from "@/platform/business-record/details";
import type { DetailsSaveOutcome } from "@/platform/business-record/details-save";
import type { LinkedSite } from "@/platform/owner-entry/linked-sites";
import { WorkspacePlace, type PlaceState } from "./WorkspacePlace";

/**
 * Business details, in the business menu: the home of /dashboard/settings.
 * The business record's facts (editable by the owner), who gets Strelva's
 * email, the people on the record, and where the rest of the old Settings
 * went. Each old `#anchor` (business, ownership, plan, domains…) has a
 * section here so a redirected link still lands somewhere that says so.
 */

export interface BusinessDetailsData {
  record: BusinessRecord;
  googleApprovalCopy?: string | null;
  publishing?: boolean;
  operator: boolean;
  sites: LinkedSite[];
  denied: LinkedSite[];
}

const OUTCOME: Record<DetailsSaveOutcome, { tone: "status" | "alert"; text: string }> = {
  saved: { tone: "status", text: "Saved to your business record. To change what your site or Google listing shows, ask Strelva from Home." },
  unchanged: { tone: "status", text: "Nothing changed." },
  conflict: { tone: "alert", text: "Someone changed these details while you were editing. Nothing was saved. Here is the latest; make your change again." },
  invalid: { tone: "alert", text: "That wasn't saved." },
  denied: { tone: "alert", text: "Only the owner can change these details. Nothing was saved." },
  failed: { tone: "alert", text: "That didn't save. Nothing changed. Try again in a minute." },
};

const INVALID_HINT: Partial<Record<EditableDetail, string>> = {
  phone: "Use a phone number with 7 to 15 digits.",
  email: "Use a full email address.",
  owner_recipient: "Use a full email address. Strelva needs one to send your reports and alerts.",
};

function Field({ name, value, readOnly, multiline = false, type = "text", hint }: { name: EditableDetail; value: string; readOnly: boolean; multiline?: boolean; type?: string; hint?: string }) {
  const id = `detail-${name}`;
  const className = "mt-1 w-full rounded-lg border border-gray-border bg-surface px-3 py-2 text-sm leading-6 focus-visible:outline focus-visible:outline-2 read-only:bg-transparent";
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-gray-muted">{DETAIL_LABELS[name]}</label>
      {multiline
        ? <textarea id={id} name={name} defaultValue={value} readOnly={readOnly} rows={4} maxLength={2000} className={className} />
        : <input id={id} name={name} type={type} defaultValue={value} readOnly={readOnly} maxLength={254} className={className} autoComplete="off" />}
      {hint ? <p className="mt-1 text-xs text-gray-muted">{hint}</p> : null}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-10 scroll-mt-8" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="mb-3 text-lg font-medium">{title}</h2>
      {children}
    </section>
  );
}

export function WorkspaceBusinessDetails({ workspaceId, state, result, googleResult, field, action }: {
  workspaceId: string;
  state: PlaceState<BusinessDetailsData>;
  result?: DetailsSaveOutcome | null;
  googleResult?: RecordGoogleSummary | null;
  field?: EditableDetail | null;
  /** The server action; absent in previews and tests. */
  action?: (formData: FormData) => Promise<void>;
}) {
  const data = state.kind === "ready" ? state.data : null;
  const workspaceHref = (view: string) => `/workspace?view=${view}&workspaceId=${encodeURIComponent(workspaceId)}`;
  const readOnly = !data || !detailsWriteSource(data.record.access, data.operator) || !action;
  const notice = result ? OUTCOME[result] : null;
  const services = data?.record.services.filter((service) => service.active) ?? [];
  const people = data?.record.people.filter((person) => person.active) ?? [];
  return (
    <WorkspacePlace workspaceId={workspaceId} eyebrow="Business" title="Business details"
      intro="Your business record: the facts Strelva keeps about your business, who gets its emails, and where the rest of your settings live."
      state={state} denied={data?.denied.map((site) => site.siteName)}
      errorTitle="Business details couldn't load" errorBody="Nothing changed. Reload the page to try again.">
      {notice ? (
        <Card padding="md" className="mt-6" role={notice.tone}>
          <p className="text-sm leading-6">{notice.text}{result === "invalid" && field && INVALID_HINT[field] ? ` ${INVALID_HINT[field]}` : ""}</p>
        </Card>
      ) : null}
      {data?.publishing && googleResult ? <Card padding="md" className="mt-4" role="status"><p className="text-sm">{{ needs_approval: "Record saved. Google changes are waiting for your approval.", confirmed: "Record saved. Google changes read back successfully.", unconfirmed: "Record saved. Google accepted the changes; confirmation is pending.", failed: "Record saved. At least one Google change did not land; each result is kept separately.", unavailable: "Record saved. Google listings could not be read; no Google update is confirmed." }[googleResult]}</p><a className="mt-2 inline-block text-sm underline" href={`/workspace/google?workspaceId=${workspaceId}`}>Review each Google change and receipt</a></Card> : null}
      {data ? (
        <>
          <Section id="business" title="About the business">
            <Card padding="lg">
              <form action={action} className="grid gap-4">
                <input type="hidden" name="workspaceId" value={workspaceId} />
                <input type="hidden" name="revision" value={data.record.revision} />
                {data.googleApprovalCopy ? <input type="hidden" name="googleApprovalDisclosed" value="1" /> : null}
                <Field name="display_name" value={detailText(data.record, "display_name")} readOnly={readOnly} />
                <Field name="phone" type="tel" value={detailText(data.record, "phone")} readOnly={readOnly} />
                <Field name="email" type="email" value={detailText(data.record, "email")} readOnly={readOnly} />
                <Field name="description" multiline value={detailText(data.record, "description")} readOnly={readOnly} />
                <div id="notifications" className="scroll-mt-8 border-t border-gray-border pt-4">
                  <Field name="owner_recipient" type="email" value={detailText(data.record, "owner_recipient")} readOnly={readOnly}
                    hint="Weekly and monthly recaps, review alerts, new inquiries and anything that needs your decision go here." />
                </div>
                {data.googleApprovalCopy ? <p role="note" className="text-sm text-gray-muted">{data.googleApprovalCopy}</p> : null}
                {readOnly
                  ? <p className="text-sm text-gray-muted">Only the owner can change these details.</p>
                  : <div><button type="submit" className="inline-flex min-h-[40px] items-center rounded-lg bg-warm-black px-4 text-sm font-medium text-warm-white focus-visible:outline focus-visible:outline-2">Save details</button></div>}
              </form>
            </Card>
          </Section>

          {data.publishing ? <Section id="publishing-facts" title="Publishing facts"><Card padding="lg"><RecordPublishingFields record={data.record} approvalCopy={data.googleApprovalCopy} readOnly={readOnly || data.record.access !== "owner"} /></Card></Section> : null}

          {services.length ? (
            <Section id="services" title="Services">
              <Card padding="md"><ul className="grid gap-2 text-sm leading-6">{services.map((service) => <li key={service.id}><span className="font-medium">{service.name}</span>{service.priceText ? <span className="text-gray-muted"> · {service.priceText}</span> : null}</li>)}</ul></Card>
            </Section>
          ) : null}

          <Section id="people" title="People and access">
            <Card padding="md">
              {people.length ? <ul className="mb-3 grid gap-1 text-sm leading-6">{people.map((person) => <li key={person.id}>{person.name}{person.roleTitle ? <span className="text-gray-muted"> · {person.roleTitle}</span> : null}</li>)}</ul> : null}
              <p className="text-sm leading-6 text-gray-muted">Who can open this business and what they can do.</p>
              <a className="mt-2 inline-block text-sm font-medium underline-offset-4 hover:underline" href={workspaceHref("access")}>Open People and access</a>
            </Card>
          </Section>

          <Section id="account" title="Your account">
            <Card padding="md">
              <p className="text-sm leading-6 text-gray-muted">The email you sign in with. It stays the same across every business you can open.</p>
              <Link className="mt-2 inline-block text-sm font-medium underline-offset-4 hover:underline" href="/workspace/account?continue=public">Open your account</Link>
            </Card>
          </Section>

          <Section id="plan" title="Plan, export and leaving">
            <Card padding="md">
              <p id="ownership" className="scroll-mt-8 text-sm leading-6 text-gray-muted">What you pay, what you own, a full export of your data, and how to leave cleanly.</p>
              <a className="mt-2 inline-block text-sm font-medium underline-offset-4 hover:underline" href={workspaceHref("settings")}>Open plan and ownership</a>
            </Card>
          </Section>

          <Section id="website" title="Your website">
            <Card padding="md">
              <span id="domains" /><span id="branding" /><span id="site-config" /><span id="dependencies" /><span id="shortcuts" />
              {data.sites.length ? (
                <ul className="grid gap-1 text-sm leading-6">{data.sites.map((site) => <li key={site.tenantId}>{site.siteName}</li>)}</ul>
              ) : <p className="text-sm text-gray-muted">No website is connected to this business yet.</p>}
              <p className="mt-2 text-sm leading-6 text-gray-muted">Your site&apos;s look, menu, domain and connected services are run by Strelva. Ask for a change from Home and Strelva handles it.</p>
              <a className="mt-2 inline-block text-sm font-medium underline-offset-4 hover:underline" href={`/workspace/results?workspaceId=${encodeURIComponent(workspaceId)}`}>Results and site health</a>
            </Card>
          </Section>
        </>
      ) : null}
    </WorkspacePlace>
  );
}
