import { StEmpty, StHead, StLabel, StNotice, StPage, StPill, StSkeleton, StTextButton } from "@/components/ui/strelva/Kit";
import styles from "./unsubscribe.module.css";

export type UnsubscribeState = "ready" | "confirm" | "loading" | "error" | "permission" | "empty" | "restored";
/** Preview composition. The signed RFC 8058 route retains its separate HTML transport. */
export function UnsubscribeView({ state, businessName, address, onUndo, onConfirm }: { state: UnsubscribeState; businessName?: string; address?: string; onUndo?: () => void; onConfirm?: () => void }) {
  return <main className={styles.page}><StPage>
    {businessName ? <StLabel>{businessName}</StLabel> : null}
    <StHead title={state === "ready" ? "You’re unsubscribed" : state === "restored" ? "You’re on the list" : state === "confirm" ? "Unsubscribe from this newsletter?" : "Newsletter preferences"} />
    {state === "loading" ? <StSkeleton label="Updating newsletter preferences" /> : state === "permission" ? <StNotice tone="critical">This link doesn&apos;t work. The unsubscribe link is incomplete or was changed.</StNotice> : state === "error" ? <StNotice tone="critical">That didn&apos;t go through. Please try the link again in a few minutes.</StNotice> : state === "empty" ? <StEmpty>Open the unsubscribe link in the newsletter you received.</StEmpty> : <p className={styles.copy}>{state === "ready" ? `${address ? `${address} ` : "You "}won’t get the monthly newsletter anymore. It took effect right away.` : state === "restored" ? "Your newsletter preference was restored in this preview." : "You won’t get further issues. Confirm below to unsubscribe."}</p>}
    <div className={styles.footer}>{state === "ready" && onUndo ? <StPill variant="soft" size="lg" block onClick={onUndo}>Undo, keep me on the list</StPill> : state === "confirm" && onConfirm ? <StPill size="lg" block onClick={onConfirm}>Unsubscribe</StPill> : state === "error" && onConfirm ? <StTextButton onClick={onConfirm}>Try again</StTextButton> : null}<p className={styles.note}>Writing in through the site still works the same.</p></div>
  </StPage></main>;
}
