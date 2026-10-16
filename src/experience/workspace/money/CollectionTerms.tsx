"use client";
import { XaButton, XaYes, type XaYesState } from "@/components/ui/strelva/Xa";
import xa from "@/experience/workspace/money/money.module.css";
import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/platform/connect/money-format";
import { strelvaUndoWindowMs } from "@/platform/infra/motion";
import { monthChoices, periodWords, shortLocalDay } from "./period";
import { useHeldYes } from "./held-yes";
import { OfferRows, useYesTurn } from "./OfferRows";
import {
  governedCollectionReceiptSchema,
  governedMoneyGraphSchema,
  sameRecordedMoneyInstant,
  type GovernedMoneyGraph,
} from "@/platform/connect/governed-money-contract";

/** Installed apps are listed by position; their internal ids never show. */
const installedLabel = (index: number) => `the app you added ${index + 1}`;
const amountWords = (cents: number, currency: string) =>
  formatMoney(cents, currency).replace(/\.00$/, "");
type Month = ReturnType<typeof monthChoices>[number];
type Price = GovernedMoneyGraph["prices"][number];
/** One price waiting for a yes: which price, for what, and the month it would cover. */
interface Offer {
  key: string;
  price: Price;
  installationId: string | null;
  appLabel: string | null;
  month: Month;
}
/**
 * The next month each price can be agreed for: from this month on, inside the
 * price's own dates, and not one the owner already agreed to.
 */
function offersFor(graph: GovernedMoneyGraph, now = new Date()): Offer[] {
  const months = monthChoices(12, now);
  const offers: Offer[] = [];
  for (const price of graph.prices) {
    const targets = price.definitionId
      ? graph.installations
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => item.definitionId === price.definitionId)
          .map(({ item, index }) => ({ id: item.id, label: installedLabel(index) }))
      : [{ id: null, label: null }];
    for (const target of targets) {
      const month = months.find(
        (item) =>
          Date.parse(item.end) > Date.parse(price.effectiveFrom) &&
          (!price.effectiveUntil ||
            Date.parse(item.start) < Date.parse(price.effectiveUntil)) &&
          !graph.terms.some(
            (term) =>
              term.priceVersion === price.version &&
              (term.installationId ?? null) === target.id &&
              Date.parse(term.periodStart ?? "") === Date.parse(item.start),
          ),
      );
      if (month)
        offers.push({
          key: `${price.version}:${target.id ?? "business"}`,
          price,
          installationId: target.id,
          appLabel: target.label,
          month,
        });
    }
  }
  return offers;
}
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
  /** How long Undo stays up before the yes is sent. 0 sends at once. */
  undoWindowMs?: number;
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
  undoWindowMs = strelvaUndoWindowMs,
}: {
  graph: GovernedMoneyGraph;
  actorId: string;
  request?: typeof fetch;
  undoWindowMs?: number;
}) {
  const [graph, setGraph] = useState(initial),
    [phase, setPhase] = useState<Phase>("ready"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [chosen, setChosen] = useState<string | null>(null),
    [later, setLater] = useState<readonly string[]>([]);
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
  const offers = offersFor(graph);
  // One yes on the screen: another price list may hold it until "Answer this one" here.
  // The yes waits out the Undo window, then sends exactly the offer it was given.
  const holding = useRef<Offer | null>(null);
  const held = useHeldYes(() => void accept(holding.current), undoWindowMs);
  const turn = useYesTurn("collection", offers.length > 0, held.held);
  const current = turn.mine
    ? (offers.find((item) => item.key === chosen) ??
      offers.find((item) => !later.includes(item.key)) ??
      null)
    : null;
  const admitted =
    graph.canPrepare &&
    !!graph.payer?.customerConfigured &&
    graph.prices.length > 0;
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
  async function accept(offer?: Offer | null) {
    if (inflight.current || phase !== "ready" || !admitted) return;
    const origin = document.activeElement;
    if (!attempt.current) {
      if (!offer) return;
      attempt.current = {
        action: "accept_collection_terms",
        workspaceId: initial.workspaceId,
        lineId: crypto.randomUUID(),
        priceVersion: offer.price.version,
        amountCents: offer.price.amountCents,
        currency: offer.price.currency,
        installationId: offer.installationId,
        periodStart: offer.month.start,
        periodEnd: offer.month.end,
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
  const yesState: XaYesState = held.held
    ? "live"
    : phase === "pending"
      ? "going"
      : "waiting";
  const sentence = (offer: Offer) =>
    `${offer.price.version}${offer.appLabel ? `, for ${offer.appLabel}` : ""}: ${amountWords(offer.price.amountCents, offer.price.currency)} for ${periodWords(offer.month.start, offer.month.end) ?? offer.month.label}.`;
  const canAnswer = admitted && !attempt.current && (phase === "ready" || phase === "pending");
  return (
    <section className={xa.section} aria-labelledby="collection-terms-heading">
      <h2 id="collection-terms-heading" className={xa.heading}>
        Prices waiting for your yes
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
          A card isn’t set up for this business yet, so there’s nothing to
          agree to.
        </p>
      ) : !graph.prices.length ? (
        <p className={xa.body}>No price is waiting for your yes.</p>
      ) : !offers.length ? (
        <p className={xa.body}>
          Every price here is agreed for the months ahead.
        </p>
      ) : null}
      {admitted && offers.length ? (
        <OfferRows
          label="Prices waiting for your yes"
          offers={offers.map((offer) => ({
            key: offer.key,
            sentence: sentence(offer),
          }))}
          current={canAnswer || held.held ? (current?.key ?? null) : null}
          locked={!canAnswer || held.held}
          onChoose={(key) => {
            turn.take();
            setChosen(key);
            setLater((items) => items.filter((item) => item !== key));
          }}
          yes={
            current ? (
              <XaYes
                state={yesState}
                yesLabel="Agree to this price"
                yesAriaLabel={`Agree: ${sentence(current)}`}
                notYetLabel="Not yet"
                block={false}
                onYes={() => {
                  holding.current = current;
                  held.hold();
                }}
                onNotYet={() => {
                  setChosen(null);
                  setLater((items) => [...items, current.key]);
                }}
                onUndo={held.undo}
                undoWindowMs={undoWindowMs}
                onUndoExpired={held.send}
                liveLabel={`You agreed to ${amountWords(current.price.amountCents, current.price.currency)} for ${periodWords(current.month.start, current.month.end) ?? current.month.label}`}
                working={
                  phase === "pending"
                    ? {
                        title: "Saving your yes",
                        steps: [
                          {
                            id: "save",
                            label: "Keeping this exact price and month with your name",
                            state: "active",
                          },
                        ],
                      }
                    : undefined
                }
              />
            ) : null
          }
        />
      ) : null}
      {attempt.current && phase === "ready" ? (
        <XaButton type="button" onClick={() => void accept()}>
          Send the same answer again
        </XaButton>
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
