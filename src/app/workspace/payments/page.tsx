import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { notFound, redirect } from "next/navigation";
import { type PaymentSource, type IssuedRequest } from "./PaymentManager";
import { PaymentsScreen } from "./PaymentsScreen";
import { moneyRpc } from "@/platform/connect";
import { connectEnabled } from "@/platform/connect";
import { readBusinessMoney } from "@/platform/connect/requests";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { MoneyLoadFailure } from "@/experience/workspace/money/MoneyLoadFailure";
import styles from "@/experience/workspace/money/money.module.css";
export const dynamic = "force-dynamic";
export default async function Payments({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  if (!workspaceReleaseEnabled() || !connectEnabled()) notFound();
  const actor = await workspaceHttpActor();
  if (!actor) redirect("/sign-in");
  const { workspaceId } = await searchParams;
  const id = workspaceId ?? "";
  let money;
  let detail: { sources: PaymentSource[]; requests: IssuedRequest[] };
  try {
    const [sources, approved, loadedMoney] = await Promise.all([
      moneyRpc<{ sources: PaymentSource[]; requests: IssuedRequest[] }>(
        "read_business_payment_sources",
        {
          p_workspace_id: workspaceId,
          p_user_id: actor.userId,
          p_verified_email: actor.verifiedEmail,
        },
      ),
      moneyRpc<PaymentSource[]>("read_agent_quote_payment_terms", {
        p_workspace_id: workspaceId,
        p_user_id: actor.userId,
        p_verified_email: actor.verifiedEmail,
      }),
      readBusinessMoney(actor, id),
    ]);
    detail = sources;
    detail.sources = detail.sources.map((s) => ({
      ...s,
      ...approved.find((a) => a.source_id === s.source_id),
    }));
    money = loadedMoney;
  } catch {
    return (
      <StrelvaShell
        title=""
        workspaceId={workspaceId}
        detailsPlace="plan"
        systemsReleased={process.env.STRELVA_SYSTEMS_RELEASE === "1"}
      >
        <div className={styles.screen}>
          <MoneyLoadFailure
            title="Payments couldn't be read just now."
            quiet="Payments already made are safe in Stripe. Try again in a moment."
            retryHref={`/workspace/payments?workspaceId=${encodeURIComponent(id)}`}
          />
        </div>
      </StrelvaShell>
    );
  }
  return (
    <StrelvaShell
      title=""
      workspaceId={workspaceId}
      detailsPlace="plan"
      systemsReleased={process.env.STRELVA_SYSTEMS_RELEASE === "1"}
    >
      <PaymentsScreen
        workspaceId={id}
        money={money}
        sources={detail.sources}
        requests={detail.requests}
      />
    </StrelvaShell>
  );
}
