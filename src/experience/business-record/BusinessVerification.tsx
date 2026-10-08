import { publicBusinessVerification, type PublicBusinessVerification } from "@/platform/business-record/verification";

/** Public, server-rendered evidence. Separate claims; never a business badge. */
export function BusinessVerification({ verification }: { verification?: PublicBusinessVerification }) {
  const value = verification ?? publicBusinessVerification(null);
  const domains = value.domains.filter(domain => domain.verified && !domain.stale);
  const google = value.googleBusinessProfile;
  const confirmedAt = value.lastConfirmedAt ? new Date(value.lastConfirmedAt).toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }) : null;
  const rows = [
    { label: "Domain control", text: domains.length ? domains.map(domain => new URL(domain.url).hostname).join(", ") + " — verified" : value.domains.length ? "Earlier proof; needs a fresh check" : "Not confirmed" },
    { label: "Google Business Profile", text: google.linked ? `${google.stale ? "Link recorded; needs a fresh check" : "Linked"}. Google verification unknown.` : "Link not confirmed. Google verification unknown." },
    { label: "Owner-confirmed facts", text: value.ownerConfirmedFactCount === null ? "Confirmation evidence unavailable" : String(value.ownerConfirmedFactCount) },
    { label: "Last owner confirmation", text: confirmedAt ?? "Not recorded" },
    { label: "Operating agency", text: value.operatingAgency?.name ?? "Not listed" },
  ];
  return <section aria-labelledby="biz-verification" className="grid gap-4 border-y border-gray-border py-6">
    <h2 id="biz-verification" className="text-xl font-semibold leading-7 tracking-tight text-warm-black">Profile verification</h2>
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(row => <div key={row.label} className="grid gap-1 min-w-0">
        <dt className="text-sm font-medium leading-5">{row.label}</dt>
        <dd className="text-sm leading-5 text-gray-muted break-words">{row.text}</dd>
      </div>)}
    </dl>
    <p className="text-sm leading-5 text-gray-muted">Domain control and owner confirmation are separate evidence. They do not verify every business fact or prove Google verification.</p>
  </section>;
}
