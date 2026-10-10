import type { PublicVerification } from "@/platform/agent-channel/contracts";

/** Display the public provenance receipt without promoting linkage to verification. */
export function BusinessEvidence({ verification: v }: { verification: PublicVerification }) {
  return <dl className="grid gap-4 text-sm">
    <div><dt className="font-medium">Domain control</dt><dd className="mt-1 break-words text-gray-muted">{v.domain.verified ? `Confirmed: ${v.domain.url}` : "Not confirmed"}</dd></div>
    <div><dt className="font-medium">Google Business Profile</dt><dd className="mt-1 text-gray-muted">{v.googleBusinessProfile.verified ? "Provider verification confirmed" : v.googleBusinessProfile.linked ? "Linked; provider verification status unknown" : "No confirmed linked profile"}</dd></div>
    <div><dt className="font-medium">Owner-confirmed facts</dt><dd className="mt-1 text-gray-muted">{v.ownerConfirmedFactCount}{v.lastConfirmedAt ? ` · Last confirmed ${new Date(v.lastConfirmedAt).toLocaleDateString("en-US", { timeZone: "UTC" })}` : " · No confirmation recorded"}</dd></div>
    {v.operatingAgencies.length ? <div><dt className="font-medium">Operating agency</dt><dd className="mt-1 break-words text-gray-muted">{v.operatingAgencies.map(a => a.name).join(", ")}</dd></div> : null}
  </dl>;
}
