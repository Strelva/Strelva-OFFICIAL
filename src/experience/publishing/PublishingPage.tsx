import type { ReactNode } from "react";
import { StEmpty, StHead, StNotice, StPage, StSkeleton, StTextButton } from "@/components/ui/strelva/Kit";
import styles from "./publishing.module.css";

export type PublishingState<T> = { kind: "ready"; data: T } | { kind: "loading" } | { kind: "permission" } | { kind: "error" };

/** Publishing owns this frame; other workspace places keep their own frame. */
export function PublishingPage({ workspaceId, title, meta, state, errorTitle, errorBody, children }: {
  workspaceId: string; title: string; meta: string; state: PublishingState<unknown>;
  errorTitle: string; errorBody: string; children?: ReactNode;
}) {
  return <main className={styles.paper} data-dashboard data-workspace-theme="linen"><StPage>
    <StHead crumb={{ label: "Systems", href: `/workspace?workspaceId=${encodeURIComponent(workspaceId)}` }} title={title} meta={meta} />
    {state.kind === "loading" ? <><StSkeleton label={`Loading ${title}`} width="65%" /><StSkeleton width="90%" /></>
      : state.kind === "permission" ? <StNotice tone="critical"><strong>This belongs to another business</strong><p>Your account isn&apos;t a member of this business. Ask its owner to invite you, or open your own workspace.</p><StTextButton href="/workspace">Go to Home</StTextButton></StNotice>
        : state.kind === "error" ? <StNotice tone="critical"><strong>{errorTitle}</strong><p>{errorBody}</p><StTextButton href="">Reload the page</StTextButton></StNotice>
          : children}
  </StPage></main>;
}

export function PublishingEmpty({ children }: { children: ReactNode }) { return <StEmpty>{children}</StEmpty>; }
