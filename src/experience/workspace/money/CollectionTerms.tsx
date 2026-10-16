"use client";
import { XaButton, XaSelect } from "@/components/ui/strelva/Xa";
import xa from "@/experience/workspace/money/money.module.css";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatMoney } from "@/platform/connect/money-format";
import { monthChoices, periodWords, shortLocalDay } from "./period";
import {
  governedCollectionReceiptSchema,
  governedMoneyGraphSchema,
  sameRecordedMoneyInstant,
  type GovernedMoneyGraph,
} from "@/platform/connect/governed-money-contract";

/** Installed apps are listed by position; their internal ids never show. */
const installedLabel = (_definitionId: string, index: number) =>
  `App you added ${index + 1}`;
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
    : "Your answer couldn't be confirmed. Check what was saved.";
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
    [month, setMonth] = useState(() => monthChoices(1)[0]!.value),
    [fieldError, setFieldError] = useState("");
  const months = monthChoices();
  const chosenMonth = months.find((item) => item.value === month);
  const start = chosenMonth?.start ?? "",
    end = chosenMonth?.end ?? "";
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
        throw Error("These prices belong to another business. Sign in again.");
      if (controller.signal.aborted || !alive.current) return;
      setGraph(next);
      if (
        attempt.current &&
        next.terms.some((term) => matches(term, attempt.current!, actorId))
      ) {
        attempt.current = null;
        setNotice(
          "Saved with your name. No card was charged.",
        );
      }
      setPhase("ready");
      if (!silent) focusFeedback(origin);
    } catch (cause) {
      if (!controller.signal.aborted && alive.current) {
        setPhase("blocked");
        setError(
          cause instanceof Error ? cause.message : "Prices couldn't be read just now.",
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
      if (!price) {
        setFieldError("Choose the price you're agreeing to.");
        return;
      }
      if (
        price.definitionId &&
        !options.some((item) => item.id === installationId)
      ) {
        setFieldError("Choose which app this price is for.");
        return;
      }
      if (!start || !end) {
        setFieldError("Choose the month it covers.");
        return;
      }
      setFieldError("");
      const periodStart = start,
        periodEnd = end;
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
          "What Strelva saved doesn't match what you chose. Check what was saved before going on.",
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
        "Saved with your name. No card was charged.",
      );
      focusFeedback(origin);
    } catch (cause) {
      if (!controller.signal.aborted && alive.current) {
        setPhase("uncertain");
        setError(
          cause instanceof Error
            ? cause.message
            : "Your answer couldn't be confirmed.",
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
        Agree to a price for a month
      </h2>
      <p className={xa.note}>
        {graph.payer?.kind === "agency"
          ? "Your agency pays it. Saying yes keeps the price with your name; nothing is charged here."
          : "Saying yes keeps the price with your name. Nothing is charged here."}
      </p>
      {!graph.canPrepare ? (
        <p className={xa.body}>
          What you agreed to stays here. Only the business owner can agree to a
          new price.
        </p>
      ) : !graph.payer?.customerConfigured ? (
        <p className={xa.body}>
          A card isn&apos;t set up for this business yet, so there&apos;s
          nothing to agree to.
        </p>
      ) : !graph.prices.length ? (
        <p className={xa.body}>No price is waiting for your yes.</p>
      ) : null}
      {admitted ? (
        <div className={xa.block}>
          <form
            className={xa.form}
            noValidate
            onSubmit={(event) => void accept(event)}
          >
            <XaSelect
              label="Price"
              value={priceVersion}
              disabled={locked}
              error={!price && fieldError ? fieldError : undefined}
              onChange={(event) => {
                setPriceVersion(event.target.value);
                setInstallationId("");
                setFieldError("");
              }}
              options={[
                { value: "", label: "Choose a price" },
                ...graph.prices.map((item) => ({
                  value: item.version,
                  label: `${item.version}, ${formatMoney(item.amountCents, item.currency)}`,
                })),
              ]}
            />
            {price?.definitionId || options.length ? (
              <XaSelect
                label="What it covers"
                value={installationId}
                disabled={locked}
                error={
                  price && fieldError ? fieldError : undefined
                }
                onChange={(event) => {
                  setInstallationId(event.target.value);
                  setFieldError("");
                }}
                options={[
                  {
                    value: "",
                    label: price?.definitionId
                      ? "Choose the app"
                      : "The whole business",
                  },
                  ...options.map((item, index) => ({
                    value: item.id,
                    label: installedLabel(item.definitionId, index),
                  })),
                ]}
              />
            ) : null}
            <XaSelect
              label="Which month it covers"
              value={month}
              disabled={locked}
              onChange={(event) => setMonth(event.target.value)}
              options={months.map((item) => ({
                value: item.value,
                label: item.label,
              }))}
            />
            {!attempt.current ? (
              <XaButton type="submit" busy={phase === "pending"} disabled={locked}>
                Agree to this price
              </XaButton>
            ) : phase === "ready" ? (
              <XaButton type="button" onClick={() => void accept()}>
                Send the same answer again
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
          Saving your answer…
        </p>
      ) : null}
      {phase === "loading" ? (
        <p role="status" className={xa.note}>
          Checking what was saved…
        </p>
      ) : null}
      {phase !== "ready" || attempt.current ? (
        <XaButton
          variant="quiet"
          disabled={phase === "pending" || phase === "loading"}
          onClick={() => void reload()}
        >
          Check what was saved
        </XaButton>
      ) : null}
      {attempt.current ? (
        <p className={xa.note}>
          Strelva hasn&apos;t confirmed your last answer yet. Check what was
          saved; sending it again sends exactly the same price and month.
        </p>
      ) : null}
      <div>
        <h3 className={xa.heading}>What you agreed to</h3>
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
                    : ""}
                </p>
                <p className={xa.note}>
                  {term.acceptedBy === actorId ? "You" : "The business owner"}{" "}
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
          <p className={xa.note}>Nothing agreed yet.</p>
        )}
      </div>
    </section>
  );
}
