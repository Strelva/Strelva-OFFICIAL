import { z } from "zod";
import { notFound, redirect } from "next/navigation";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { readPackageCreator } from "@/experience/workspace/agency/package-server";
import { SourceAttributionView } from "@/experience/workspace/money/SourceAttributionView";
import { MoneyLoadFailure } from "@/experience/workspace/money/MoneyLoadFailure";
import styles from "@/experience/workspace/money/money.module.css";
export const dynamic = "force-dynamic";

export default async function SourceAttributionPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string; systemId?: string }>;
}) {
  if (!workspaceReleaseEnabled()) notFound();
  const actor = await workspaceHttpActor();
  if (!actor) redirect("/sign-in");
  const parsed = z
    .object({ workspaceId: z.string().uuid(), systemId: z.string().uuid() })
    .safeParse(await searchParams);
  if (!parsed.success) notFound();
  const { workspaceId, systemId } = parsed.data;
  let creator;
  try {
    creator = await readPackageCreator(actor, workspaceId, systemId);
  } catch {
    return (
      <StrelvaShell title="" workspaceId={workspaceId} active="system">
        <div className={styles.screen}>
          <MoneyLoadFailure
            title="Strelva couldn't check who made this."
            quiet="It keeps running as it is. Strelva checks again next time you open this."
            retryHref={`/workspace/source-attribution?${new URLSearchParams({ workspaceId, systemId })}`}
          />
        </div>
      </StrelvaShell>
    );
  }
  return (
    <StrelvaShell title="" workspaceId={workspaceId} active="system">
      <SourceAttributionView
        workspaceId={workspaceId}
        systemId={systemId}
        creator={creator}
      />
    </StrelvaShell>
  );
}
