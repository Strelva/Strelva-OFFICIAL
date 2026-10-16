"use client";
/**
 * XA · S5 · A Possibility. The live site beside the proposed one, the reason
 * in Pebble's words, and the one yes. Make real goes through the same
 * POST /api/workspace/systems/make-real as the Possibilities list; the
 * server keeps authority. After a live start the page reads back what landed
 * (the same GET /api/workspace the workspace loads) and shows the activation's
 * real steps; it never asks the owner to reload. Make real has no one-tap
 * reversal: rolling it back is its own change (Needs you's honest undo), so
 * the pill after Live offers "Roll it back", which asks Strelva for exactly
 * that.
 */
import { useEffect, useRef, useState } from "react";
import { XaButtonLink, XaHeadline, XaInitial, XaSays, XaSystemTile, XaTextLink, XaYes, type XaWorkingStep, type XaYesState } from "@/components/ui/strelva/Xa";
import { actorPresentation, recordedActor } from "@/platform/presentation/actor";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { possibilityScope } from "../from-workspace";
import { makeRealSummary, type MakeRealOutcome, type SystemPossibility, type SystemView } from "../model";
import { LIVE_YES, ownerOnlyReason, requestMakeReal } from "../make-real-request";
import { followMakeReal, type MakeRealReadBack } from "../make-real-readback";
import { makeRealStepState } from "../MakeRealProgress";
import { WebsiteSystemCanvas, type WebsiteCanvasMode } from "../WebsiteSystemCanvas";
import styles from "./system-xa.module.css";

export function PossibilityView({ system, systems, possibility, workspaceId, appBase, readOnly, canMakeReal, blockedReason, systemHref, sandbox, onBack, onAsk }: {
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
  /** Ask Strelva (the System's composer path). Rolling a live change back is asked for here. */
  onAsk?: (request: string) => void;
}) {
  const request = useWorkspaceRequest();
  const [mode, setMode] = useState<WebsiteCanvasMode>("both");
  const [yes, setYes] = useState<XaYesState>("waiting");
  const [outcome, setOutcome] = useState<MakeRealOutcome | null>(null);
  const inFlight = useRef(false);
  const [readBack, setReadBackState] = useState<MakeRealReadBack | null>(null);
  // The last real steps seen while it ran, so the settled trail keeps them once the activation is gone.
  const [seen, setSeen] = useState<MakeRealReadBack & { kind: "running" } | null>(null);
  const setReadBack = (read: MakeRealReadBack) => { setReadBackState(read); if (read.kind === "running") setSeen(read); };
  const following = useRef<AbortController | null>(null);
  useEffect(() => () => following.current?.abort(), []);
  const execution = possibility.executionAvailability ?? "unavailable";
  const rehearsal = execution === "rehearsal";
  const scope = possibilityScope(possibility, systems);
  const reason = blockedReason ?? (readOnly || !canMakeReal ? ownerOnlyReason()
    : execution === "unavailable" ? "Live execution is unavailable for this Possibility. You can still open and compare it."
      : possibility.staleReason ? "Refresh this Possibility before it can go live."
        : possibility.status !== "ready" ? "Still being explored. It can be made real once it is ready." : undefined);

  async function putLive() {
    if (inFlight.current || reason || execution === "unavailable") return;
    inFlight.current = true;
    setYes("going");
    const since = Date.now();
    const next = await requestMakeReal(request, workspaceId, possibility.id, rehearsal ? "rehearsal" : "live");
    inFlight.current = false;
    setOutcome(next);
    if (next.kind !== "live" || !next.started) { setYes("expired"); return; }
    // Started: stay in the Working trail and read back each real step until it settles.
    following.current?.abort();
    const controller = new AbortController();
    following.current = controller;
    const last = await followMakeReal(request, { workspaceId, systemId: system.id, possibilityId: possibility.id, activationId: next.activationId, since }, setReadBack, { signal: controller.signal });
    if (controller.signal.aborted) return;
    setYes(last.kind === "finished" || (last.kind === "running" && last.activation.status === "made_real") ? "live" : "expired");
  }

  const activation = readBack?.kind === "running" ? readBack.activation : seen?.activation ?? null;
  const steps: XaWorkingStep[] = activation?.lines.length
    ? activation.lines.map((line, index) => { const state = makeRealStepState(line.state); return { id: `${activation.id}-${index}`, label: line.label, state: state === "done" ? "done" : state === "failed" ? "failed" : state === "active" ? "active" : "pending" }; })
    : [{ id: "ask", label: rehearsal ? "Running it on an isolated copy" : readBack?.kind === "finished" ? `Made it live on ${system.name}` : outcome?.kind === "live" ? "Started. Reading back what landed" : "Asking to make it live", state: "active" }];
  // Name whoever proposed it, when recorded; never an anonymous proposal dressed as one.
  const actor = recordedActor(possibility.actor);
  const proposer = actorPresentation(possibility.actor).name;
  const proposedOn = possibility.proposedAt && !Number.isNaN(Date.parse(possibility.proposedAt)) ? new Date(possibility.proposedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  const kickerLead = actor?.kind === "agency" && proposer ? <XaInitial name={actor.displayName.split(" at ").pop() || proposer} size={24} color="#2f5236" /> : <XaSystemTile kind="website" size={24} />;
  const kickerText = proposer ? `A Possibility from ${proposer}${proposedOn ? ` · ${proposedOn}` : ""}` : `A Possibility for ${system.name}`;
  const try_ = possibility.tryHref ?? possibility.openHref;
  const settled = outcome?.kind === "result" ? `${outcome.result.headline} ${makeRealSummary(outcome.result)}` : outcome && outcome.kind !== "live" ? outcome.message : undefined;
  // What the read-back says once the trail stops, in one sentence. Never "reload".
  const landed = outcome?.kind !== "live" ? null
    : !outcome.started ? outcome.headline
      : readBack?.kind === "finished" ? readBack.sentence ?? `${outcome.headline.replace(/\.$/, "")}. ${system.name} shows the change.`
        : readBack?.kind === "running" ? readBack.activation.status === "needs_attention" ? `${readBack.activation.headline}. ${readBack.activation.done} of ${readBack.activation.total} landed; Strelva keeps what landed and shows what still needs you on ${system.name}.`
          : readBack.activation.status === "rolled_back" ? `${readBack.activation.headline} Your live site is as it was.` : `Still going: ${readBack.activation.done} of ${readBack.activation.total} done. It keeps going on its own, and ${system.name} shows each step.`
          : readBack?.kind === "unavailable" ? `It started, but I couldn't read back what landed just now. ${system.name} shows each step as it settles.`
            : `It started. ${system.name} shows each step as it settles.`;
  const live = yes === "live";

  return <div className={styles.screen} aria-labelledby="xa-possibility-title">
    <button type="button" className={styles.back} onClick={onBack}>‹ {system.name}</button>
    <div className={styles.compareHead}>
      <p className={styles.kicker}>{kickerLead}{kickerText}{scope.length > 1 ? ` · also changes ${scope.filter(name => name !== system.name).join(", ")}` : ""}</p>
      <XaHeadline id="xa-possibility-title" size="sm" quiet={yes === "live" ? `It's live on ${system.name} now.` : rehearsal ? "It runs on an isolated copy. Your live site stays as it is." : "Your site stays as it is until you say yes."}>{possibility.title}</XaHeadline>
      {possibility.staleReason ? <p className={styles.sentence} data-tone="waits">{possibility.staleReason} A fresh check is needed.</p> : null}
    </div>
    <WebsiteSystemCanvas system={system} comparing={possibility} mode={mode} onModeChange={setMode} sandbox={sandbox} />
    <div className={styles.compareFoot}>
      {settled ? <div role={outcome?.kind === "result" ? "status" : "alert"}><XaSays links={outcome?.kind === "result" ? undefined : [<XaTextLink key="check" href={systemHref(system.id)}>Check {system.name}</XaTextLink>]}>{settled}</XaSays></div>
        : outcome?.kind === "live" && yes !== "going" && landed ? <div role="status"><XaSays links={[<XaTextLink key="see" href={systemHref(system.id)}>See {system.name}</XaTextLink>]}>{landed}</XaSays></div>
          : <XaSays>{possibility.evidence ?? possibility.summary}</XaSays>}
      <div className={styles.compareActions}>
        {try_ && yes === "waiting" ? <XaButtonLink href={`${appBase}${try_}`} size="lg">{possibility.tryHref ? "Try it as a visitor" : "Open it"}</XaButtonLink> : null}
        {outcome?.kind === "result" ? null : <XaYes state={yes} block={false} onYes={() => void putLive()} onNotYet={yes === "waiting" ? onBack : undefined}
          yesLabel={rehearsal ? "Rehearse this change" : LIVE_YES}
          working={yes === "going" || live ? { title: rehearsal ? "Rehearsing this change" : live ? "Live" : "Making it live", steps: live ? steps.map(step => ({ ...step, state: "done" as const })) : steps } : undefined}
          liveLabel={outcome?.kind === "live" ? `Live on ${system.name}` : undefined}
          undoLabel="Roll it back"
          onUndo={live && onAsk ? () => onAsk(`Roll back "${possibility.title}" on ${system.name}, step by step.`) : undefined}
          disabledReason={reason} />}
      </div>
    </div>
  </div>;
}
