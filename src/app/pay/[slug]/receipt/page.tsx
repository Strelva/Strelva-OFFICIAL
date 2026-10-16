import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { XaTextLink } from "@/components/ui/strelva/Xa";
import { resolveOwnerBrand } from "@/platform/agency-brand/server";
import { issueAgencyPayLinkReceipt } from "@/platform/agency-pay-links";
import { resolvePublicPayLink } from "@/platform/agency-pay-links/public";
import { MoneyDocument } from "@/experience/workspace/billing/MoneyDocument";
import { PublicMoneyPage } from "@/experience/workspace/money/PublicMoneyPage";
import styles from "@/experience/workspace/money/money.module.css";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** The payer's Payment receipt. Numbered once the payment is confirmed, never emailed. */
export default async function PayLinkReceiptPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resolved = await resolvePublicPayLink(slug);
  if (resolved?.kind !== "connected") notFound();
  const { link } = resolved;
  const brand = await resolveOwnerBrand(link.agencyWorkspaceId ?? "");
  if (link.status !== "paid") return <PublicMoneyPage brand={brand} lead={<>
    <p className={styles.publicKicker}>Payment receipt</p>
    <h1 className={styles.publicTitle}>No payment is recorded for this link yet.</h1>
    <p className={styles.publicCopy}>Stripe tells {brand.name} when a payment goes through. If you just paid, refresh in a minute; the receipt appears here once Stripe confirms it.</p>
    <p className={styles.note}><XaTextLink href={`/pay/${link.slug}`}>Back to the payment link</XaTextLink></p>
  </>} />;
  const doc = await issueAgencyPayLinkReceipt(link.id);
  return <PublicMoneyPage brand={brand} single lead={<MoneyDocument doc={doc} back={{ label: "Back to the payment link", href: `/pay/${link.slug}` }} />} />;
}
