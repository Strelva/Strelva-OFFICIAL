import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StHead, StNotice, StPage } from "@/components/ui/strelva/Kit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceReturnTarget } from "@/platform/workspaces/location";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { paymentLinkAgency } from "@/experience/workspace/billing/payment-links-server";
import { MoneyDocument } from "@/experience/workspace/billing/MoneyDocument";
import { agencyPayLinksEnabled, issueAgencyPayLinkReceipt, readAgencyPayLinkRecords, readMoneyDocument } from "@/platform/agency-pay-links";
import { resolveOwnerBrand } from "@/platform/agency-brand/server";

export const moneyDocumentMetadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };

/** Shared by the agency's Invoice and Payment receipt pages. Only a manager of the issuing agency reaches either. */
export async function MoneyDocumentPage({ kind, params, searchParams }: { kind: "invoice" | "payment_receipt"; params: Promise<{ linkId: string }>; searchParams: Promise<{ workspaceId?: string }> }) {
  if (!workspaceReleaseEnabled() || !agencyPayLinksEnabled()) notFound();
  const { linkId } = await params;
  const { workspaceId = "" } = await searchParams;
  const actor = await workspaceHttpActor();
  if (!actor) redirect(`/sign-in?next=${encodeURIComponent(workspaceReturnTarget(`/workspace/payment-links/${linkId}/${kind === "invoice" ? "invoice" : "receipt"}?${new URLSearchParams({ workspaceId })}`) || "/workspace")}`);
  let agency;
  try { agency = await paymentLinkAgency(actor, workspaceId); } catch { notFound(); }
  const link = (await readAgencyPayLinkRecords(actor, agency.id)).find(row => row.id === linkId && row.rail === "connected_account");
  if (!link) notFound();
  const brand = await resolveOwnerBrand(agency.id);
  const back = { label: "Payment links", href: `/workspace/payment-links?workspaceId=${encodeURIComponent(agency.id)}` };
  const shell = (children: React.ReactNode) => <StrelvaShell title="" workspaceId={agency.id} workspaceName={brand.agencyId === agency.id ? brand.name : "Agency identity unavailable"} ownerBrand={brand} agencyNavigation={{ paymentLinksCurrent: true, leadsAvailable: true }}><StPage>{children}</StPage></StrelvaShell>;
  if (kind === "payment_receipt" && link.status !== "paid") return shell(<><StHead title="Payment receipt" crumb={back} /><StNotice>No payment is recorded for this link yet. Stripe confirms payments; this page updates when it does.</StNotice></>);
  const doc = kind === "invoice" ? await readMoneyDocument("invoice", link.id) : await issueAgencyPayLinkReceipt(link.id);
  if (!doc) notFound();
  // Only an open Invoice prints a pay URL. NEXT_PUBLIC_APP_URL, else the request origin, so it is always absolute.
  let payUrl: string | undefined;
  if (kind === "invoice" && link.status === "open") {
    let origin = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    if (!origin) {
      const requestHeaders = await headers();
      const requestHost = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "";
      const requestProto = requestHeaders.get("x-forwarded-proto") || (requestHost.includes("localhost") ? "http" : "https");
      origin = requestHost ? `${requestProto}://${requestHost}` : "";
    }
    payUrl = `${origin}/pay/${link.slug}`;
  }
  return shell(<MoneyDocument doc={doc} back={back} payUrl={payUrl} />);
}
