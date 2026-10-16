import { notFound, redirect } from "next/navigation";
import { getAuthenticatedOperatorContext } from "@/platform/infra/auth";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { moneyRpc } from "@/platform/connect";
import { XaHeadline } from "@/components/ui/strelva/Xa";
import { MoneyLoadFailure } from "@/experience/workspace/money/MoneyLoadFailure";
import styles from "@/experience/workspace/money/money.module.css";
import ReviewQueue, {
  type ReconciliationIssue,
} from "@/app/workspace/money-reconciliation/ReviewQueue";
export const dynamic = "force-dynamic";

/**
 * Stripe payments that didn't match Strelva's records, reviewed one at a time
 * by Strelva staff. October 16: this lives in the operator console, never on a
 * business owner's or agency's screen.
 */
export default async function OperatorReconciliationPage() {
  if (
    !workspaceReleaseEnabled() ||
    process.env.STRELVA_MONEY_RECONCILIATION !== "1"
  )
    notFound();
  const operator = await getAuthenticatedOperatorContext();
  if (!operator) redirect("/sign-in");
  let issues: ReconciliationIssue[];
  try {
    issues = await moneyRpc("read_money_reconciliation", {
      p_user: operator.actor.userId,
      p_email: operator.actor.verifiedEmail,
      p_limit: 100,
    });
  } catch {
    return (
      <div data-workspace-theme="linen" className={styles.screen}>
        <MoneyLoadFailure
          title="Payments to check couldn't be read."
          quiet="Only Strelva staff can open them. Sign in again and try once more."
          retryHref="/admin/money/reconciliation"
        />
      </div>
    );
  }
  const open = issues.filter((issue) => !issue.resolution).length;
  return (
    <div data-workspace-theme="linen" className={styles.screen}>
      <XaHeadline quiet="Check each one in Stripe, then write down what you found. Writing it down never moves money.">
        {open
          ? `${open === 1 ? "1 payment needs" : `${open} payments need`} a look.`
          : "Every payment matches."}
      </XaHeadline>
      <ReviewQueue
        key={operator.actor.userId}
        issues={issues}
        actorId={operator.actor.userId}
      />
    </div>
  );
}
