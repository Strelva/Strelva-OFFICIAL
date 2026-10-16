"use client";
/**
 * XA · S5 · A Possibility. The live site beside the proposed one, the reason
 * in Pebble's words, and the one yes. Make real goes through the same
 * POST /api/workspace/systems/make-real as the Possibilities list; the
 * server keeps authority, and an unconfirmed answer asks for a reload
 * instead of a retry. There is no Undo pill because Make real has no
 * one-step reversal here; History holds the way back.
 */
import { useRef, useState } from "react";
import { XaButtonLink, XaHeadline, XaSays, XaSystemTile, XaTextLink, XaYes, type XaWorkingStep, type XaYesState } from "@/components/ui/strelva/Xa";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { possibilityScope } from "../from-workspace";
import { makeRealSummary, type MakeRealOutcome, type SystemPossibility, type SystemView } from "../model";
import { requestMakeReal } from "../make-real-request";
import { WebsiteSystemCanvas, type WebsiteCanvasMode } from "../WebsiteSystemCanvas";
import styles from "./system-xa.module.css";

export function PossibilityView({ system, systems, possibility, workspaceId, appBase, readOnly, canMakeReal, blockedReason, systemHref, sandbox, onBack }: {
  system: SystemView & { surface: Extract<SystemView["surface"], { kind: "website" }> };
  systems: readonly SystemView[];
  possibility: SystemPossibility;
  workspaceId: string;
  appBase: string;
  readOnly: boolean;
  canMakeReal: boolean;
  /** Why the yes is not available here, in one sentence. */
  blockedReason?: string;
  systemHref: (id: string) => string;
  sandbox: (src: string) => string;
  onBack: () => void;
}) {
  const request = useWorkspaceRequest();
  const [mode, setMode] = useState<WebsiteCanvasMode>("both");
  const [yes, setYes] = useState<XaYesState>("waiting");
  const [outcome, setOutcome] = useState<MakeRealOutcome | null>(null);
  const inFlight = useRef(false);
  const execution = possibility.executionAvailability ?? "unavailable";
  const rehearsal = execution === "rehearsal";
  const scope = possibilityScope(possibility, systems);
  const reason = blockedReason ?? (readOnly || !canMakeReal ? "Only an owner of this business can make a possibility real."
    : execution === "unavailable" ? "Live execution is unavailable for this Possibility. You can still open and compare it."
      : possibility.staleReason ? "Refresh this Possibility before making it real."
        : possibility.status !== "ready" ? "Still being explored. It can be made real once it is ready." : undefined);

  async function putLive() {
    if (inFlight.current || reason || execution === "unavailable") return;
    inFlight.current = true;
    setYes("going");
    const next = await requestMakeReal(request, workspaceId, possibility.id, rehearsal ? "rehearsal" : "live");
    inFlight.current = false;
    setOutcome(next);
    setYes(next.kind === "live" ? "live" : "expired");
  }

  const steps: XaWorkingStep[] = [{ id: "ask", label: rehearsal ? "Running it on an isolated copy" : "Asking to put it live", state: "active" }];
  const try_ = possibility.tryHref ?? possibility.openHref;
  const settled = outcome?.kind === "result" ? `${outcome.result.headline} ${makeRealSummary(outcome.result)}` : outcome && outcome.kind !== "live" ? outcome.message : undefined;

  return <div className={styles.screen} aria-labelledby="xa-possibility-title">
    <button type="button" className={styles.back} onClick={onBack}>‹ {system.name}</button>
    <div className={styles.compareHead}>
      <p className={styles.kicker}><XaSystemTile kind="website" size={24} />A Possibility for {system.name}{scope.length > 1 ? ` · also changes ${scope.filter(name => name !== system.name).join(", ")}` : ""}</p>
      <XaHeadline id="xa-possibility-title" size="sm" quiet={rehearsal ? "It runs on an isolated copy. Your live site stays as it is." : "Your site stays as it is until you say yes."}>{possibility.title}</XaHeadline>
      {possibility.staleReason ? <p className={styles.sentence} data-tone="waits">{possibility.staleReason} A fresh check is needed.</p> : null}
    </div>
    <WebsiteSystemCanvas system={system} comparing={possibility} mode={mode} onModeChange={setMode} sandbox={sandbox} />
    <div className={styles.compareFoot}>
      {settled ? <div role={outcome?.kind === "result" ? "status" : "alert"}><XaSays links={outcome?.kind === "result" ? undefined : [<XaTextLink key="reload" href={systemHref(system.id)}>Reload now</XaTextLink>]}>{settled}</XaSays></div>
        : outcome?.kind === "live" ? <div role="status"><XaSays links={[<XaTextLink key="reload" href={systemHref(system.id)}>Reload now</XaTextLink>]}>{outcome.started ? "It started. Reload to see what landed and what still needs attention." : "Reload to check the current outcome before another change."}</XaSays></div>
          : <XaSays>{possibility.evidence ?? possibility.summary}</XaSays>}
      <div className={styles.compareActions}>
        {try_ && yes === "waiting" ? <XaButtonLink href={`${appBase}${try_}`} size="lg">{possibility.tryHref ? "Try it as a visitor" : "Open it"}</XaButtonLink> : null}
        {outcome?.kind === "result" ? null : <XaYes state={yes} block={false} onYes={() => void putLive()} onNotYet={yes === "waiting" ? onBack : undefined}
          yesLabel={rehearsal ? "Rehearse this change" : undefined}
          working={yes === "going" ? { title: rehearsal ? "Rehearsing this change" : "Putting it live", steps } : undefined}
          liveLabel={outcome?.kind === "live" ? outcome.headline : undefined}
          disabledReason={reason} />}
      </div>
    </div>
  </div>;
}
