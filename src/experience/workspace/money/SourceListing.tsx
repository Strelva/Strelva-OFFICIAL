"use client";
import { XaButton, XaChoices, XaYes } from "@/components/ui/strelva/Xa";
import xa from "@/experience/workspace/money/money.module.css";
import { useEffect, useRef, useState } from "react";
import { strelvaUndoWindowMs } from "@/platform/infra/motion";
import { useHeldYes } from "./held-yes";
import { OfferRows } from "./OfferRows";
import {
  neutralCreatorListingCommandSchema,
  neutralCreatorSourcesSchema,
  type NeutralCreatorSources,
} from "@/platform/connect/neutral-creator-contract";
import { z } from "zod";
type Command = z.infer<typeof neutralCreatorListingCommandSchema>;
export function SourceListing(props: {
  graph: NeutralCreatorSources;
  actorId: string;
  request?: typeof fetch;
  /** How long Undo stays up before the offer is sent. 0 sends at once. */
  undoWindowMs?: number;
}) {
  return (
    <ScopedSourceListing
      key={`${props.graph.workspaceId}:${props.actorId}`}
      {...props}
    />
  );
}
function ScopedSourceListing({
  graph: initial,
  request = fetch,
  undoWindowMs = strelvaUndoWindowMs,
}: {
  graph: NeutralCreatorSources;
  actorId: string;
  request?: typeof fetch;
  undoWindowMs?: number;
}) {
  const [graph, setGraph] = useState(initial),
    [revision, setRevision] = useState(""),
    [agreementVersion, setAgreementVersion] = useState(""),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState(""),
    [fieldError, setFieldError] = useState<{ revision?: string; agreement?: string }>({});
  const pending = useRef<{ command: Command; sourceSystemId: string } | null>(
      null,
    ),
    inflight = useRef<AbortController | null>(null),
    alive = useRef(true),
    status = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      inflight.current?.abort();
    };
  }, []);
  // Read the listings again whenever the creator comes back to this tab.
  const reloadRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    const back = () => {
      if (document.visibilityState !== "hidden") reloadRef.current();
    };
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);
    return () => {
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", back);
    };
  }, []);
  function focus(origin: Element | null) {
    if (
      document.activeElement === origin ||
      document.activeElement === document.body
    )
      queueMicrotask(() => {
        if (
          alive.current &&
          (document.activeElement === origin ||
            document.activeElement === document.body)
        )
          status.current?.focus();
      });
  }
  async function reload(silent = false) {
    if (inflight.current) return;
    const controller = new AbortController(),
      origin = document.activeElement;
    inflight.current = controller;
    setBusy(true);
    try {
      const response = await request(
        `/api/workspace/creator-source-money?${new URLSearchParams({ workspaceId: initial.workspaceId })}`,
        {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        },
      );
      if (!response.ok)
        throw Error("Strelva couldn't confirm you can offer apps just now.");
      const next = neutralCreatorSourcesSchema.parse(await response.json());
      if (
        next.workspaceId !== initial.workspaceId ||
        next.sources.some(
          (item) =>
            item.creatorWorkspaceId !== initial.workspaceId ||
            item.definitionId !== `system-source:${item.sourceSystemId}`,
        )
      )
        throw Error("These apps belong to another agency. Sign in again.");
      const attempt = pending.current,
        source = attempt
          ? next.sources.find(
              (item) =>
                item.sourceRevisionId === attempt.command.sourceRevisionId,
            )
          : null;
      if (
        source?.listingId &&
        (source.sourceSystemId !== attempt?.sourceSystemId ||
          source.listingAgreementVersion !==
            attempt?.command.agreementVersion ||
          source.listingRateReference !== attempt?.command.rateReference)
      )
        throw Error(
          "What was saved doesn't match what you chose. Nothing else can be offered until Strelva looks at it.",
        );
      if (controller.signal.aborted || !alive.current) return;
      setGraph(next);
      if (source?.listingId) {
        pending.current = null;
        setFeedback(`${source.name} is offered to other businesses now.`);
      } else if (attempt)
        setFeedback(
          "Strelva still hasn't confirmed your last app. Check again before offering another.",
        );
      if (!silent) focus(origin);
    } catch (error) {
      if (!controller.signal.aborted && alive.current) {
        setFeedback(
          error instanceof Error
            ? error.message
            : "Strelva couldn't confirm that.",
        );
        if (!silent) focus(origin);
      }
    } finally {
      if (!controller.signal.aborted && alive.current) {
        inflight.current = null;
        setBusy(false);
      }
    }
  }
  reloadRef.current = () => void reload(true);
  async function register(choice?: { revision: string; agreementVersion: string }) {
    if (inflight.current || pending.current || !graph.canRegister) return;
    const chosenRevision = choice?.revision ?? revision,
      chosenAgreement = choice?.agreementVersion ?? agreementVersion;
    const source = graph.sources.find(
        (item) =>
          item.sourceRevisionId === chosenRevision &&
          item.qualified &&
          !item.listingId,
      ),
      agreement = graph.agreements.find(
        (item) => item.version === chosenAgreement,
      );
    const problems = {
      revision: source ? undefined : "Choose the app to offer.",
      agreement: agreement ? undefined : "Choose what you earn.",
    };
    setFieldError(problems);
    if (!source || !agreement) return;
    const origin = document.activeElement,
      command = neutralCreatorListingCommandSchema.parse({
        workspaceId: initial.workspaceId,
        sourceRevisionId: chosenRevision,
        agreementVersion: agreement.version,
        rateReference: agreement.rateReference,
      });
    pending.current = { command, sourceSystemId: source.sourceSystemId };
    const controller = new AbortController();
    inflight.current = controller;
    setBusy(true);
    try {
      const response = await request("/api/workspace/creator-source-money", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
        signal: controller.signal,
      });
      if (!response.ok)
        throw Error(
          "Strelva couldn't confirm that. Check what was saved.",
        );
      const receipt = z
        .object({
          id: z.uuid(),
          creatorWorkspaceId: z.literal(command.workspaceId),
          sourceSystemId: z.literal(source.sourceSystemId),
          sourceRevisionId: z.literal(command.sourceRevisionId),
          definitionId: z.literal(source.definitionId),
          agreementVersion: z.literal(command.agreementVersion),
          rateReference: z.literal(command.rateReference),
        })
        .strict()
        .parse(await response.json());
      if (controller.signal.aborted || !alive.current) return;
      setGraph((current) => ({
        ...current,
        sources: current.sources.map((item) =>
          item.sourceRevisionId === chosenRevision
            ? {
                ...item,
                listingId: receipt.id,
                listingAgreementVersion: receipt.agreementVersion,
                listingRateReference: receipt.rateReference,
              }
            : item,
        ),
      }));
      pending.current = null;
      setFeedback(`${source.name} is offered to other businesses now.`);
      focus(origin);
    } catch (error) {
      if (!controller.signal.aborted && alive.current) {
        setFeedback(
          error instanceof Error
            ? error.message
            : "Strelva hasn't confirmed it yet.",
        );
        focus(origin);
      }
    } finally {
      if (!controller.signal.aborted && alive.current) {
        inflight.current = null;
        setBusy(false);
      }
    }
  }
  const locked = busy || !!pending.current;
  const percent = (bps: number) => `You earn ${bps / 100}% of each payment`;
  const rateFor = (version: string | null | undefined) =>
    graph.agreements.find((item) => item.version === version);
  const waiting = pending.current
    ? graph.sources.find(
        (item) =>
          item.sourceRevisionId === pending.current!.command.sourceRevisionId,
      )
    : null;
  const offerable = graph.sources.filter(
    (item) => item.qualified && !item.listingId,
  );
  const current =
    offerable.find((item) => item.sourceRevisionId === revision) ??
    offerable[0] ??
    null;
  const agreement =
    graph.agreements.find((item) => item.version === agreementVersion) ??
    (graph.agreements.length === 1 ? graph.agreements[0]! : null);
  // Undo first, then send: an offer has no server reversal.
  const held = useHeldYes(() => {
    if (!current || !agreement) return;
    setRevision(current.sourceRevisionId);
    setAgreementVersion(agreement.version);
    void register({
      revision: current.sourceRevisionId,
      agreementVersion: agreement.version,
    });
  }, undoWindowMs);
  return (
    <section className={xa.section} aria-labelledby="source-listing-heading">
      <h2 id="source-listing-heading" className={xa.heading}>
        Offer an app to other businesses
      </h2>
      <p className={xa.body}>
        Each business that adds it gets its own copy, and you never see their
        records.
      </p>
      {!graph.canRegister ? (
        <p className={xa.body}>
          Your agency can’t offer new apps right now. Apps already offered
          stay offered.
        </p>
      ) : !offerable.length ? (
        <p className={xa.note}>
          Every app you published is offered. A new one shows up here once you
          publish it.
        </p>
      ) : !graph.agreements.length ? (
        <p className={xa.body}>
          There’s no agreement yet for what you earn, so nothing can be offered.
        </p>
      ) : (
        <OfferRows
          label="Apps you can offer"
          offers={offerable.map((item) => ({
            key: item.sourceRevisionId,
            sentence: `${item.name} can be offered to other businesses.`,
          }))}
          current={locked && !held.held ? null : (current?.sourceRevisionId ?? null)}
          locked={locked || held.held}
          onChoose={(key) => {
            setRevision(key);
            setFieldError({});
          }}
          yes={
            current ? (
              <>
                {graph.agreements.length > 1 ? (
                  <XaChoices
                    label="What you earn"
                    variant="list"
                    value={agreement?.version ?? null}
                    error={fieldError.agreement}
                    onChange={(value) => {
                      setAgreementVersion(value);
                      setFieldError({});
                    }}
                    options={graph.agreements.map((item) => ({
                      value: item.version,
                      label: percent(item.rateBps),
                    }))}
                  />
                ) : agreement ? (
                  <p className={xa.note}>{percent(agreement.rateBps)}.</p>
                ) : null}
                <XaYes
                  state={held.held ? "live" : "waiting"}
                  yesLabel="Offer it"
                  yesAriaLabel={`Offer ${current.name}`}
                  block={false}
                  disabled={locked}
                  disabledReason={
                    agreement ? undefined : "Choose what you earn first."
                  }
                  onYes={() => held.hold()}
                  onUndo={held.undo}
                  undoWindowMs={undoWindowMs}
                  onUndoExpired={held.send}
                  liveLabel={`${current.name} is offered`}
                />
              </>
            ) : null
          }
        />
      )}
      <p
        role="status"
        tabIndex={-1}
        ref={status}
        aria-live="polite"
        className={xa.body}
      >
        {feedback}
      </p>
      {pending.current ? (
        <>
          <p className={xa.body}>
            Strelva hasn&apos;t confirmed {waiting?.name ?? "your last app"} yet.
            Nothing new can be offered until it does.
          </p>
          <XaButton
            variant="quiet"
            disabled={busy}
            onClick={() => void reload()}
          >
            Check what was saved
          </XaButton>
        </>
      ) : null}
      <ul className={xa.section}>
        {graph.sources
          .filter((item) => item.listingId)
          .map((item) => (
            <li className={xa.body} key={item.sourceRevisionId}>
              <a
                className={xa.detailsToggle}
                href={`/workspace/source-attribution?${new URLSearchParams({ workspaceId: graph.workspaceId, systemId: item.sourceSystemId })}`}
              >
                {item.name}
              </a>{" "}
              <span className={xa.note}>
                is offered.
                {rateFor(item.listingAgreementVersion)
                  ? ` ${percent(rateFor(item.listingAgreementVersion)!.rateBps)}.`
                  : ""}
              </span>
            </li>
          ))}
      </ul>
    </section>
  );
}
