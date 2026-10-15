import { StCopy, StEntry, StHead, StNotice, StState, StTextButton } from "@/components/ui/strelva/Kit";
import { formatMoney } from "@/platform/connect/money-format";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import { PayLinkForm } from "./PayLinkForm";

export interface ConnectedPayLinkView {
  slug: string;
  clientName: string;
  description: string;
  amountCents: number | null;
  minCents: number | null;
  maxCents: number | null;
  currency: string;
  status: "open" | "paid" | "expired";
  receiptNumber: number | null;
}

/** A payment link that charges on the agency's own Stripe account. */
export function ConnectedPayLink({ link, brand, payment }: { link: ConnectedPayLinkView; brand: OwnerBrand; payment?: string }) {
  const amount = link.amountCents !== null ? formatMoney(link.amountCents, link.currency)
    : `${formatMoney(link.minCents ?? 0, link.currency)} to ${formatMoney(link.maxCents ?? 0, link.currency)}`;
  return <StEntry brand={brand}>
    <StHead title={`Pay ${brand.name}`} meta={link.clientName} />
    <StCopy>{link.description}</StCopy>
    <StCopy muted>{amount}</StCopy>
    {link.status === "expired" ? <StNotice>This payment link has expired. Ask {brand.name} for a new link. Payments already started in Stripe may still complete.</StNotice>
      : link.status === "paid" ? <><StState kind="live">Paid</StState><StTextButton href={`/pay/${link.slug}/receipt`}>View payment receipt</StTextButton></>
      : <>
        {payment === "success" ? <StNotice>Stripe accepted your payment. It shows as paid here once Stripe confirms it. Refresh in a minute.</StNotice> : null}
        {payment === "cancelled" ? <StNotice>No charge made. You can try again below.</StNotice> : null}
        <PayLinkForm slug={link.slug} amountCents={link.amountCents ?? undefined} minCents={link.minCents ?? undefined} maxCents={link.maxCents ?? undefined} />
      </>}
    <StCopy muted>Payments go to {brand.name}&apos;s Stripe account. Strelva never holds the money.</StCopy>
  </StEntry>;
}
