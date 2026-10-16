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
    [feedback, setFeedback] = useState("");
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
        throw Error("Your creator access could not be confirmed just now.");
      const next = neutralCreatorSourcesSchema.parse(await response.json());
      if (
        next.workspaceId !== initial.workspaceId ||
        next.sources.some(
          (item) =>
            item.creatorWorkspaceId !== initial.workspaceId ||
            item.definitionId !== `system-source:${item.sourceSystemId}`,
        )
      )
        throw Error("These Systems belong to another creator.");
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
          "The recorded listing does not match what you asked for. Nothing else will be listed until this is reviewed.",
        );
      if (controller.signal.aborted || !alive.current) return;
      setGraph(next);
      if (source?.listingId) {
        pending.current = null;
        setFeedback(`${source.name} is listed with its creator agreement.`);
      } else if (attempt)
        setFeedback(
          "Your last listing is still not confirmed. Check again before listing anything else.",
        );
      if (!silent) focus(origin);
    } catch (error) {
      if (!controller.signal.aborted && alive.current) {
        setFeedback(
          error instanceof Error
            ? error.message
            : "Listing could not be confirmed.",
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
          "The listing could not be confirmed. Check what was recorded.",
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
      setFeedback(`${source.name} is listed with its creator agreement.`);
      focus(origin);
    } catch (error) {
      if (!controller.signal.aborted && alive.current) {
        setFeedback(
          error instanceof Error
            ? error.message
            : "Listing remains unconfirmed.",
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
        Systems you list for other businesses
      </h2>
      <p className={xa.body}>
        List a System you published, with its written creator agreement. Each
        business that installs it gets its own Version. Listing gives you no
        access to their records or accounts.
      </p>
      {graph.canRegister ? (
        <div className={xa.block}>
          <form className={xa.form} onSubmit={(event) => void register(event)}>
            <XaSelect
              label="System"
              value={revision}
              disabled={locked}
              required
              onChange={(event) => setRevision(event.target.value)}
              options={[
                { value: "", label: "Choose a published System" },
                ...graph.sources
                  .filter((item) => item.qualified && !item.listingId)
                  .map((item) => ({
                    value: item.sourceRevisionId,
                    label: `${item.name}, Release ${item.revision}`,
                  })),
              ]}
            />
            <XaSelect
              label="Creator agreement"
              value={agreementVersion}
              disabled={locked}
              required
              onChange={(event) => setAgreementVersion(event.target.value)}
              options={[
                { value: "", label: "Choose a written agreement" },
                ...graph.agreements.map((item) => ({
                  value: item.version,
                  label: `${item.version}, ${percent(item.rateBps)}`,
                })),
              ]}
            />
            <XaButton
              type="submit"
              disabled={locked || !revision || !agreementVersion}
            >
              List this System
            </XaButton>
          </form>
        </div>
      ) : (
        <p className={xa.body}>
          New listings are not available for this workspace. Systems already
          listed stay listed.
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
            Your listing of {waiting?.name ?? "this System"} is not confirmed
            yet. New listings wait until it is.
          </p>
          <XaButton
            variant="quiet"
            disabled={busy}
            onClick={() => void reload()}
          >
            Check what was recorded
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
