import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { XaStatus } from "@/components/ui/strelva/Xa";
import { PublicMoneyPage } from "@/experience/workspace/money/PublicMoneyPage";
import styles from "@/experience/workspace/money/money.module.css";
import { PayLinkForm } from "./PayLinkForm";
import { formatPayLinkAmount } from "@/lib/pay-links";
import { resolvePublicPayLink } from "@/platform/agency-pay-links/public";
import { resolveOwnerBrand } from "@/platform/agency-brand/server";
import { ConnectedPayLink } from "./ConnectedPayLink";
import { payLinkDoorBadge, payLinkDoorTerms } from "@/lib/pay-link-copy";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ payment?: string; amount?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolvePublicPayLink(slug);
  if (resolved?.kind === "connected") {
    if (resolved.link.status === "expired") return { title: { absolute: "Payment link expired" }, robots: { index: false, follow: false } };
    return { title: { absolute: `Pay ${resolved.link.agencyDisplayName || "your agency"}` }, robots: { index: false, follow: false }, referrer: "no-referrer" };
  }
  const config = resolved?.config;
  if (config?.revokedAt) return { title: { absolute: "Payment link expired" } };
  if (!config) {
    return { title: { absolute: "Not found" } };
  }
  return {
    title: { absolute: `Your ${config.clientName} website` },
    description: `Your new ${config.clientName} website. Secure payment to get started.`,
  };
}

export default async function PayLinkPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const resolved = await resolvePublicPayLink(slug);
  if (!resolved) {
    notFound();
  }
  if (resolved.kind === "connected") {
    const { link } = resolved;
    const sp = await searchParams;
    const brand = await resolveOwnerBrand(link.agencyWorkspaceId ?? "");
    // Public fields only: never who created or revoked the link.
    return <ConnectedPayLink brand={brand} payment={sp?.payment} link={{ slug: link.slug, clientName: link.clientName, description: link.description ?? "", amountCents: link.amountCents, minCents: link.minCents, maxCents: link.maxCents, currency: link.currency, status: link.status, receiptNumber: link.receiptNumber }} />;
  }
  const config = resolved.config;

  const agency = config.agencyDisplayName || "Strelva Agency";
  if (config.revokedAt) return <PublicMoneyPage brand={agency} lead={<>
    <h1 className={styles.publicTitle}>Payment link expired</h1>
    <p className={styles.publicCopy}>This payment link has expired. Ask {agency} for a new link. Payments already started in Stripe may still complete.</p>
  </>} />;

  const sp = await searchParams;
  const payment = sp?.payment;
  const amountParam = sp?.amount;
  const successAmountCents = amountParam && /^\d+$/.test(amountParam) ? Number.parseInt(amountParam, 10) : null;

  return <PublicMoneyPage brand={agency} lead={<>
    <p className={styles.publicKicker}>{payLinkDoorBadge(config.door)} · {agency} · Runs on Strelva</p>
    <h1 className={styles.publicTitle}>Your new {config.clientName} website.</h1>
    <p className={styles.publicCopy}>{payLinkDoorTerms(config)}</p>
    {config.customCopy ? <p className={styles.publicCopy}>{config.customCopy}</p> : null}
    {config.returnUrl ? <p className={styles.note}><a className={styles.detailsToggle} href={config.returnUrl}>Back to {config.clientName}</a></p> : null}
    <p className={styles.note}>Questions about this payment go to {agency}.</p>
  </>} panel={<>
    {payment === "success" ? <p className={styles.body} role="status"><XaStatus kind="live" size="sm">Thank you</XaStatus> Payment received{successAmountCents ? ` for ${formatPayLinkAmount(successAmountCents)}` : ""}.</p> : null}
    {payment === "cancelled" ? <p className={styles.body} role="status">No charge made. You can try again below.</p> : null}
    {typeof config.amountCents === "number" ? <><p className={styles.note}>{config.door === "build" ? "Your website build" : "Your start payment"}</p><p className={styles.amount}>{formatPayLinkAmount(config.amountCents)}</p></> : null}
    <PayLinkForm slug={config.slug} door={config.door} amountCents={config.amountCents} minCents={config.minCents} maxCents={config.maxCents} />
  </>} />;
}
