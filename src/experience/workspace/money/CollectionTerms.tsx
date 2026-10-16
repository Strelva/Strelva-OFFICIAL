"use client";
import { XaButton, XaField, XaSelect } from "@/components/ui/strelva/Xa";
import xa from "@/experience/workspace/money/money.module.css";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatMoney } from "@/platform/connect/money-format";
import { localMoment, periodWords, shortLocalDay } from "./period";
import {
  governedCollectionReceiptSchema,
  governedMoneyGraphSchema,
  sameRecordedMoneyInstant,
  type GovernedMoneyGraph,
} from "@/platform/connect/governed-money-contract";

const installedLabel = (definitionId: string, index: number) =>
  definitionId.startsWith("system-source:")
    ? `Installed System ${index + 1}`
    : definitionId;
type Command = {
  action: "accept_collection_terms";
  workspaceId: string;
  lineId: string;
  priceVersion: string;
  amountCents: number;
  currency: string;
  installationId: string | null;
  periodStart: string;
  periodEnd: string;
};
type Phase = "ready" | "pending" | "loading" | "uncertain" | "blocked";
function message(value: unknown) {
  return value &&
    typeof value === "object" &&
    "error" in value &&
    typeof value.error === "string"
    ? value.error
    : "Your answer could not be confirmed. Check what was recorded.";
}
function matches(value: unknown, command: Command, actorId: string) {
  const receipt = governedCollectionReceiptSchema.safeParse(value);
  if (!receipt.success) return false;
  const item = receipt.data;
  return (
    item.acceptedBy === actorId &&
    item.lineId === command.lineId &&
    item.workspaceId === command.workspaceId &&
    item.priceVersion === command.priceVersion &&
    item.amountCents === command.amountCents &&
    item.currency === command.currency &&
    item.installationId === command.installationId &&
    sameRecordedMoneyInstant(item.periodStart, command.periodStart) &&
    sameRecordedMoneyInstant(item.periodEnd, command.periodEnd)
  );
}
export function CollectionTerms(props: {
  graph: GovernedMoneyGraph;
  actorId: string;
  request?: typeof fetch;
}) {
  return (
    <ScopedCollectionTerms
      key={`${props.graph.workspaceId}:${props.actorId}`}
      {...props}
    />
  );
}
function ScopedCollectionTerms({
  graph: initial,
  actorId,
  request = fetch,
}: {
  graph: GovernedMoneyGraph;
  actorId: string;
  request?: typeof fetch;
}) {
  const [graph, setGraph] = useState(initial),
    [phase, setPhase] = useState<Phase>("ready"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [priceVersion, setPriceVersion] = useState(""),
    [installationId, setInstallationId] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const attempt = useRef<Command | null>(null),
    inflight = useRef<AbortController | null>(null),
    alive = useRef(true),
    feedback = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      inflight.current?.abort();
    };
  }, []);
  // Read the recorded terms again whenever the owner comes back to this tab,
  // instead of a Reload control.
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
  const price = graph.prices.find((item) => item.version === priceVersion);
  const options = graph.installations.filter(
    (item) => !price?.definitionId || item.definitionId === price.definitionId,
  );
  const admitted =
    graph.canPrepare &&
    !!graph.payer?.customerConfigured &&
    graph.prices.length > 0;
  const locked = phase !== "ready" || !!attempt.current;
  function focusFeedback(origin: Element | null) {
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
          feedback.current?.focus();
      });
  }
  async function reload(silent = false) {
    if (inflight.current) return;
    const controller = new AbortController(),
      origin = document.activeElement;
    inflight.current = controller;
    setPhase("loading");
    setError("");
    try {
      const response = await request(
        `/api/workspace/money-preparation?${new URLSearchParams({ workspaceId: initial.workspaceId })}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw Error(message(body));
      const next = governedMoneyGraphSchema.parse(body);
      if (
        next.workspaceId !== initial.workspaceId ||
        next.terms.some((term) => term.workspaceId !== initial.workspaceId)
      )
        throw Error("These terms belong to another business. Sign in again.");
      if (controller.signal.aborted || !alive.current) return;
      setGraph(next);
      if (
        attempt.current &&
        next.terms.some((term) => matches(term, attempt.current!, actorId))
      ) {
        attempt.current = null;
        setNotice(
          "Your exact terms and period are recorded. No card was charged.",
        );
      }
      setPhase("ready");
      if (!silent) focusFeedback(origin);
    } catch (cause) {
      if (!controller.signal.aborted && alive.current) {
        setPhase("blocked");
        setError(
          cause instanceof Error ? cause.message : "Terms could not be loaded.",
        );
        if (!silent) focusFeedback(origin);
      }
    } finally {
      if (!controller.signal.aborted && alive.current) inflight.current = null;
    }
  }
  reloadRef.current = () => void reload(true);
  async function accept(event?: FormEvent) {
    event?.preventDefault();
    if (inflight.current || phase !== "ready" || !admitted) return;
    const origin = document.activeElement;
    if (!attempt.current) {
      if (
        !price ||
        !start ||
        !end ||
        (price.definitionId &&
          !options.some((item) => item.id === installationId))
      )
        return;
      if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
        setError("Choose a valid start and end date.");
        focusFeedback(origin);
        return;
      }
      const periodStart = new Date(start).toISOString(),
        periodEnd = new Date(end).toISOString();
      if (Date.parse(periodEnd) <= Date.parse(periodStart)) {
        setError("The period must end after it starts.");
        focusFeedback(origin);
        return;
      }
      attempt.current = {
        action: "accept_collection_terms",
        workspaceId: initial.workspaceId,
        lineId: crypto.randomUUID(),
        priceVersion: price.version,
        amountCents: price.amountCents,
        currency: price.currency,
        installationId: installationId || null,
        periodStart,
        periodEnd,
      };
    }
    const command = attempt.current,
      controller = new AbortController();
    inflight.current = controller;
    setPhase("pending");
    setError("");
    setNotice("");
    try {
      const response = await request("/api/workspace/money-preparation", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
        signal: controller.signal,
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw Error(message(body));
      if (
        !body ||
        typeof body !== "object" ||
        !("receipt" in body) ||
        !("collectionDispatch" in body) ||
        body.collectionDispatch !== "not_configured" ||
        !matches(body.receipt, command, actorId)
      )
        throw Error(
          "The acceptance receipt did not match the exact terms. Check what was recorded before continuing.",
        );
      if (controller.signal.aborted || !alive.current) return;
      attempt.current = null;
      const receipt = governedCollectionReceiptSchema.parse(body.receipt);
      setGraph((current) => ({
        ...current,
        terms: [
          ...current.terms.filter((term) => term.lineId !== receipt.lineId),
          receipt,
        ],
      }));
      setPhase("blocked");
      setNotice(
        "Your exact terms and period are recorded. No card was charged. Check what was recorded before agreeing to another period.",
      );
      focusFeedback(origin);
    } catch (cause) {
      if (!controller.signal.aborted && alive.current) {
        setPhase("uncertain");
        setError(
          cause instanceof Error
            ? cause.message
            : "Acceptance could not be confirmed.",
        );
        focusFeedback(origin);
      }
    } finally {
      if (!controller.signal.aborted && alive.current) inflight.current = null;
    }
  }
  return (
    <section className={xa.section} aria-labelledby="collection-terms-heading">
      <h2 id="collection-terms-heading" className={xa.heading}>
        Agree to a price for a period
      </h2>
      <p className={xa.note}>
        Pick the written price and the dates it covers. Agreeing records it with
        your name. It does not charge a card.
      </p>
      {graph.payer ? (
        <p className={xa.body}>
          {graph.payer.kind === "agency"
            ? "Your agency pays. Agency approval to charge a card stays a separate step."
            : "This business pays. Charging a card stays a separate step."}
        </p>
      ) : null}
      {!graph.canPrepare ? (
        <p className={xa.body}>
          What you agreed to stays here. Only a current business owner can agree
          to a new price.
        </p>
      ) : !graph.payer?.customerConfigured ? (
        <p className={xa.body}>
          Payment details are not set up yet, so no price can be agreed.
        </p>
      ) : !graph.prices.length ? (
        <p className={xa.body}>
          No written price is recorded for this business.
        </p>
      ) : null}
      {admitted ? (
        <div className={xa.block}>
          <form className={xa.form} onSubmit={(event) => void accept(event)}>
            <XaSelect
              label="Written price"
              value={priceVersion}
              disabled={locked}
              onChange={(event) => {
                setPriceVersion(event.target.value);
                setInstallationId("");
              }}
              options={[
                { value: "", label: "Choose a written price" },
                ...graph.prices.map((item) => ({
                  value: item.version,
                  label: `${item.version}, ${formatMoney(item.amountCents, item.currency)}`,
                })),
              ]}
              required
            />
            {price?.definitionId || options.length ? (
              <XaSelect
                label="Which System it covers"
                value={installationId}
                disabled={locked}
                required={!!price?.definitionId}
                onChange={(event) => setInstallationId(event.target.value)}
                options={[
                  {
                    value: "",
                    label: price?.definitionId
                      ? "Choose the System"
                      : "The whole business",
                  },
                  ...options.map((item, index) => ({
                    value: item.id,
                    label: installedLabel(item.definitionId, index),
                  })),
                ]}
              />
            ) : null}
            <div className={xa.pair}>
              <XaField
                label="Period starts (your local time)"
                type="datetime-local"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                required
                disabled={locked}
              />
              <XaField
                label="Period ends (your local time)"
                type="datetime-local"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                required
                disabled={locked}
              />
            </div>
            {start &&
            end &&
            !Number.isNaN(Date.parse(start)) &&
            !Number.isNaN(Date.parse(end)) ? (
              <p className={xa.note}>
                Covers {localMoment(new Date(start).toISOString())} to{" "}
                {localMoment(new Date(end).toISOString())}, your time.
              </p>
            ) : null}
            {!attempt.current ? (
              <XaButton
                type="submit"
                disabled={locked || !price || !start || !end}
              >
                Accept these terms and period
              </XaButton>
            ) : phase === "ready" ? (
              <XaButton type="button" onClick={() => void accept()}>
                Retry the exact acceptance
              </XaButton>
            ) : null}
          </form>
        </div>
      ) : null}
      {error || notice ? (
        <p
          ref={feedback}
          tabIndex={-1}
          role={error ? "alert" : "status"}
          className={error ? xa.critical : xa.body}
        >
          {error || notice}
        </p>
      ) : (
        <p ref={feedback} tabIndex={-1} className="sr-only">
          Current recorded terms loaded.
        </p>
      )}
      {phase === "pending" ? (
        <p role="status" className={xa.note}>
          Recording the exact terms…
        </p>
      ) : null}
      {phase === "loading" ? (
        <p role="status" className={xa.note}>
          Checking what was recorded…
        </p>
      ) : null}
      {phase !== "ready" || attempt.current ? (
        <XaButton
          variant="quiet"
          disabled={phase === "pending" || phase === "loading"}
          onClick={() => void reload()}
        >
          Check what was recorded
        </XaButton>
      ) : null}
      {attempt.current ? (
        <p className={xa.note}>
          Your last answer is not confirmed yet. Check what was recorded; a
          retry sends exactly the same terms.
        </p>
      ) : null}
      <div>
        <h3 className={xa.heading}>Accepted history</h3>
        {graph.terms.length ? (
          <ul className={xa.section}>
            {graph.terms.map((term) => (
              <li key={term.lineId} className={xa.body}>
                <p>
                  {term.priceVersion},{" "}
                  {formatMoney(term.amountCents, term.currency).replace(
                    /\.00$/,
                    "",
                  )}{" "}
                  {periodWords(term.periodStart, term.periodEnd)
                    ? `for ${periodWords(term.periodStart, term.periodEnd)}`
                    : "(dates not recorded)"}
                </p>
                <p className={xa.note}>
                  {term.acceptedBy === actorId ? "You" : "A business owner"}{" "}
                  agreed
                  {shortLocalDay(term.acceptedAt)
                    ? ` on ${shortLocalDay(term.acceptedAt)}`
                    : ""}
                  .
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className={xa.note}>No collection terms have been accepted.</p>
        )}
      </div>
    </section>
  );
}
