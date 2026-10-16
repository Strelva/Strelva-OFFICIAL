"use client";
/**
 * XA · S5 · A Possibility. The live site beside the proposed one, the reason
 * in Pebble's words, and the one yes. Make real goes through the same
 * POST /api/workspace/systems/make-real as the Possibilities list; the
 * server keeps authority. After a live start the page reads back what landed
 * (the same GET /api/workspace the workspace loads) and shows the activation's
 * real steps; it never asks the owner to reload. Once it is live the canvas
 * shows the live site alone, read again, and Strelva says what landed in one
 * sentence; every step stays behind "Show every step". Make real has no
 * one-tap reversal: rolling it back is its own change, so no pill pretends to
 * be Undo. The sentence says so and "Ask Strelva to roll it back" stays as a
 * text link for as long as the page is open.
 */
import { useEffect, useRef, useState } from "react";
import { XaButtonLink, XaHeadline, XaInitial, XaSays, XaSystemTile, XaTextLink, XaYes, type XaWorkingStep, type XaYesState } from "@/components/ui/strelva/Xa";
import { actorPresentation, recordedActor } from "@/platform/presentation/actor";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { possibilityScope } from "../from-workspace";
import { makeRealSummary, type MakeRealOutcome, type SystemPossibility, type SystemView } from "../model";
import { LIVE_YES, ownerOnlyReason, requestMakeReal, whoCanSayYesHref } from "../make-real-request";
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
          : readBack?.kind === "unavailable" ? `It started, but Strelva couldn't read back what landed just now. ${system.name} shows each step as it settles.`
            : `It started. ${system.name} shows each step as it settles.`;
  const live = yes === "live";
  // A blocked yes always says what clears it.
  const unblock = readOnly || !canMakeReal || blockedReason ? <XaTextLink href={whoCanSayYesHref(workspaceId)}>See who can say yes</XaTextLink>
    : possibility.staleReason && onAsk ? <XaTextLink onClick={() => onAsk(`Refresh "${possibility.title}" on ${system.name} so it can go live.`)}>Ask Strelva to refresh it</XaTextLink>
      : try_ ? <XaTextLink href={`${appBase}${try_}`}>{possibility.tryHref ? "Try it as a visitor" : "Open it"}</XaTextLink>
        : <XaTextLink href={systemHref(system.id)}>See {system.name}</XaTextLink>;
  // After Live: one read-back sentence, the steps behind a disclosure, and the honest way back as a link that stays.
  const settledLinks = [
    <XaTextLink key="see" href={systemHref(system.id)}>See {system.name}</XaTextLink>,
    ...(live && onAsk ? [<XaTextLink key="back" onClick={() => onAsk(`Roll back "${possibility.title}" on ${system.name}, step by step.`)}>Ask Strelva to roll it back</XaTextLink>] : []),
  ];
  const landedSentence = landed && live && onAsk ? `${landed.replace(/\s+$/, "")} Rolling it back is its own change.` : landed;

  return <div className={styles.screen} aria-labelledby="xa-possibility-title">
    <button type="button" className={styles.back} onClick={onBack}>‹ {system.name}</button>
    <div className={styles.compareHead}>
      <p className={styles.kicker}>{kickerLead}{kickerText}{scope.length > 1 ? ` · also changes ${scope.filter(name => name !== system.name).join(", ")}` : ""}</p>
      <XaHeadline id="xa-possibility-title" size="sm" quiet={yes === "live" ? `It's live on ${system.name} now.` : rehearsal ? "It runs on an isolated copy. Your live site stays as it is." : "Your site stays as it is until you say yes."}>{possibility.title}</XaHeadline>
      {possibility.staleReason ? <p className={styles.sentence} data-tone="waits">{possibility.staleReason} A fresh check is needed.</p> : null}
    </div>
    <WebsiteSystemCanvas system={system} comparing={possibility} mode={mode} onModeChange={setMode} sandbox={sandbox} landed={live} />
    <div className={styles.compareFoot}>
      {settled ? <div role={outcome?.kind === "result" ? "status" : "alert"}><XaSays links={outcome?.kind === "result" ? undefined : [<XaTextLink key="check" href={systemHref(system.id)}>Check {system.name}</XaTextLink>]}>{settled}</XaSays></div>
        : outcome?.kind === "live" && yes !== "going" && landedSentence ? <div role="status" className={styles.landed}>
          <XaSays links={settledLinks}>{landedSentence}</XaSays>
          {live && activation?.lines.length ? <details className={styles.more}><summary>Show every step</summary>
            <ol className={styles.quietList} aria-label="Every step">{activation.lines.map((line, index) => <li key={index} className={styles.note}>{line.label}</li>)}</ol>
          </details> : null}
        </div>
          : <XaSays>{possibility.evidence ?? possibility.summary}</XaSays>}
      <div className={styles.compareActions}>
        {try_ && yes === "waiting" ? <XaButtonLink href={`${appBase}${try_}`} size="lg">{possibility.tryHref ? "Try it as a visitor" : "Open it"}</XaButtonLink> : null}
        {outcome?.kind === "result" ? null : <XaYes state={yes} block={false} onYes={() => void putLive()} onNotYet={yes === "waiting" ? onBack : undefined}
          yesLabel={rehearsal ? "Rehearse this change" : LIVE_YES}
          working={yes === "going" ? { title: rehearsal ? "Rehearsing this change" : "Making it live", steps } : undefined}
          disabledReason={reason} unblock={unblock} />}
      </div>
    </div>
  </div>;
}
