"use client";
import { XaButton, XaSelect } from "@/components/ui/strelva/Xa";
import xa from "@/experience/workspace/money/money.module.css";
import { useEffect, useRef, useState, type FormEvent } from "react";
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
}: {
  graph: NeutralCreatorSources;
  actorId: string;
  request?: typeof fetch;
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
  async function register(event: FormEvent) {
    event.preventDefault();
    if (inflight.current || pending.current || !graph.canRegister) return;
    const source = graph.sources.find(
        (item) =>
          item.sourceRevisionId === revision &&
          item.qualified &&
          !item.listingId,
      ),
      agreement = graph.agreements.find(
        (item) => item.version === agreementVersion,
      );
    const problems = {
      revision: source ? undefined : "Choose the app to offer.",
      agreement: agreement ? undefined : "Choose the agreement it's offered under.",
    };
    setFieldError(problems);
    if (!source || !agreement) return;
    const origin = document.activeElement,
      command = neutralCreatorListingCommandSchema.parse({
        workspaceId: initial.workspaceId,
        sourceRevisionId: revision,
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
          item.sourceRevisionId === revision
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
  const percent = (bps: number) => `${bps / 100}% of each payment`;
  const rateFor = (version: string | null | undefined) =>
    graph.agreements.find((item) => item.version === version);
  const waiting = pending.current
    ? graph.sources.find(
        (item) =>
          item.sourceRevisionId === pending.current!.command.sourceRevisionId,
      )
    : null;
  return (
    <section className={xa.section} aria-labelledby="source-listing-heading">
      <h2 id="source-listing-heading" className={xa.heading}>
        Offer an app to other businesses
      </h2>
      <p className={xa.body}>
        Pick an app you published and the agreement it&apos;s offered under.
        Each business that adds it gets its own copy, and you never see their
        records.
      </p>
      {graph.canRegister ? (
        <div className={xa.block}>
          <form
            className={xa.form}
            noValidate
            onSubmit={(event) => void register(event)}
          >
            <XaSelect
              label="App"
              value={revision}
              disabled={locked}
              error={fieldError.revision}
              onChange={(event) => {
                setRevision(event.target.value);
                setFieldError((current) => ({ ...current, revision: undefined }));
              }}
              options={[
                { value: "", label: "Choose an app you published" },
                ...graph.sources
                  .filter((item) => item.qualified && !item.listingId)
                  .map((item) => ({
                    value: item.sourceRevisionId,
                    label: `${item.name}, Release ${item.revision}`,
                  })),
              ]}
            />
            <XaSelect
              label="Agreement"
              value={agreementVersion}
              disabled={locked}
              error={fieldError.agreement}
              onChange={(event) => {
                setAgreementVersion(event.target.value);
                setFieldError((current) => ({
                  ...current,
                  agreement: undefined,
                }));
              }}
              options={[
                { value: "", label: "Choose an agreement" },
                ...graph.agreements.map((item) => ({
                  value: item.version,
                  label: `${item.version}, ${percent(item.rateBps)}`,
                })),
              ]}
            />
            <XaButton type="submit" busy={busy} disabled={locked}>
              Offer this app
            </XaButton>
          </form>
        </div>
      ) : (
        <p className={xa.body}>
          Your agency can&apos;t offer new apps right now. Apps already offered
          stay offered.
        </p>
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
                {item.name}, Release {item.revision}
              </a>{" "}
              <span className={xa.note}>
                · {item.listingAgreementVersion}
                {rateFor(item.listingAgreementVersion)
                  ? `, ${percent(rateFor(item.listingAgreementVersion)!.rateBps)}`
                  : ""}
              </span>
            </li>
          ))}
      </ul>
    </section>
  );
}
