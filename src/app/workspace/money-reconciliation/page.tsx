import { notFound, redirect } from "next/navigation";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { moneyRpc } from "@/platform/connect";
import { XaHeadline } from "@/components/ui/strelva/Xa";
import { MoneyLoadFailure } from "@/experience/workspace/money/MoneyLoadFailure";
import styles from "@/experience/workspace/money/money.module.css";
import ReviewQueue, { type ReconciliationIssue } from "./ReviewQueue";
export const dynamic = "force-dynamic";
/** Library (Strelva staff): Stripe records that did not match the ledger, reviewed one at a time. */
export default async function Page() {
  if (!workspaceReleaseEnabled() || process.env.STRELVA_MONEY_RECONCILIATION !== "1") notFound();
  const actor = await workspaceHttpActor(); if (!actor) redirect("/sign-in");
  let issues: ReconciliationIssue[];
  try { issues = await moneyRpc("read_money_reconciliation", { p_user: actor.userId, p_email: actor.verifiedEmail, p_limit: 100 }); }
  catch { return <main data-workspace-theme="linen"><div className={styles.screen}><MoneyLoadFailure title="Payment exceptions could not be loaded." quiet="Confirm operator access and try again." retryHref="/workspace/money-reconciliation" /></div></main>; }
  const open = issues.filter(issue => !issue.resolution).length;
  return <main data-workspace-theme="linen"><div className={styles.screen}>
    <XaHeadline quiet="Check each against Stripe and the ledger, then record what you found. Recording never moves money.">{open ? `${open === 1 ? "1 payment exception waits" : `${open} payment exceptions wait`} for review.` : "Payment exceptions"}</XaHeadline>
    <ReviewQueue key={actor.userId} issues={issues} />
  </div></main>;
}
