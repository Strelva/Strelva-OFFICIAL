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
  neutralVersionMoneyGraphSchema,
  neutralVersionCollectionCommandSchema,
  neutralPaidVersionReceiptSchema,
  neutralReviewedReceiptMatches,
  reconcileNeutralVersionMoney,
  type NeutralVersionMoneyGraph,
  type NeutralVersionCollectionCommand,
  type NeutralReviewedVersion,
} from "@/platform/connect/neutral-creator-contract";
type Pending = {
  command: NeutralVersionCollectionCommand;
  reviewed: NeutralReviewedVersion;
};
type Installed = NeutralVersionMoneyGraph["installations"][number];
type Price = NeutralVersionMoneyGraph["prices"][number];
type Month = ReturnType<typeof monthChoices>[number];
interface Offer {
  key: string;
  installed: Installed;
  price: Price;
  month: Month;
}
const amountWords = (cents: number, currency: string) =>
  formatMoney(cents, currency).replace(/\.00$/, "");
/** Each released app's prices, for the next month not already agreed. */
function offersFor(graph: NeutralVersionMoneyGraph, now = new Date()): Offer[] {
  const months = monthChoices(12, now);
  const offers: Offer[] = [];
  for (const installed of graph.installations.filter(
    (item) => item.qualified && item.released,
  ))
    for (const price of graph.prices.filter(
      (item) => item.definitionId === installed.definitionId,
    )) {
      const month = months.find(
        (item) =>
          Date.parse(item.end) > Date.parse(price.effectiveFrom) &&
          (!price.effectiveUntil ||
            Date.parse(item.start) < Date.parse(price.effectiveUntil)) &&
          !graph.history.some(
            (line) =>
              line.version_id === installed.versionId &&
              line.price_version === price.version &&
              Date.parse(line.period_start) === Date.parse(item.start),
          ),
      );
      if (month)
        offers.push({
          key: `${installed.versionId}:${price.version}`,
          installed,
          price,
          month,
        });
    }
  return offers;
}
export function VersionTerms(props: {
  graph: NeutralVersionMoneyGraph;
  actorId: string;
  request?: typeof fetch;
  /** How long Undo stays up before the yes is sent. 0 sends at once. */
  undoWindowMs?: number;
}) {
  return (
    <ScopedVersionTerms
      key={`${props.graph.workspaceId}:${props.actorId}`}
      {...props}
    />
  );
}
function ScopedVersionTerms({
  graph: initial,
  actorId,
  request = fetch,
  undoWindowMs = strelvaUndoWindowMs,
}: {
  graph: NeutralVersionMoneyGraph;
  actorId: string;
  request?: typeof fetch;
  undoWindowMs?: number;
}) {
  const [graph, setGraph] = useState(initial),
    [phase, setPhase] = useState<"ready" | "pending" | "uncertain" | "blocked">(
      "ready",
    ),
    [feedback, setFeedback] = useState("");
  const [chosen, setChosen] = useState<string | null>(null),
    [later, setLater] = useState<readonly string[]>([]);
  const pending = useRef<Pending | null>(null),
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
  // Read again whenever the owner comes back to this tab, instead of a Reload control.
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
  const turn = useYesTurn("version", offers.length > 0, held.held);
  const current = turn.mine
    ? (offers.find((item) => item.key === chosen) ??
      offers.find((item) => !later.includes(item.key)) ??
      null)
    : null;
  const locked = phase !== "ready" || !!pending.current,
    admitted = graph.canPrepare && graph.customerConfigured;
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
    setPhase("pending");
    setFeedback("");
    try {
      const response = await request(
        `/api/workspace/version-money-preparation?${new URLSearchParams({ workspaceId: initial.workspaceId })}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        },
      );
      if (!response.ok)
        throw Error("Prices for your apps couldn't be read just now.");
      const next = neutralVersionMoneyGraphSchema.parse(await response.json());
      const receipt = reconcileNeutralVersionMoney(
        next,
        initial.workspaceId,
        actorId,
        pending.current,
      );
      if (controller.signal.aborted || !alive.current) return;
      setGraph(next);
      if (receipt) {
        pending.current = null;
        setFeedback(
          "Saved with your name. No card was charged.",
        );
      } else if (pending.current)
        setFeedback(
          "Strelva still hasn't confirmed your last answer. Check again before agreeing to anything else.",
        );
      setPhase(pending.current ? "uncertain" : "ready");
      if (!silent) focus(origin);
    } catch (error) {
      if (!controller.signal.aborted && alive.current) {
        setPhase("blocked");
        setFeedback(
          error instanceof Error
            ? error.message
            : "What was saved couldn't be read just now.",
        );
        if (!silent) focus(origin);
      }
    } finally {
      if (!controller.signal.aborted && alive.current) inflight.current = null;
    }
  }
  reloadRef.current = () => void reload(true);
  async function accept(offer: Offer | null) {
    if (inflight.current || locked || !admitted || !offer) return;
    const { installed, price, month } = offer;
    if (!installed.qualified || !installed.released) return;
    const origin = document.activeElement;
    try {
      pending.current = {
        command: neutralVersionCollectionCommandSchema.parse({
          workspaceId: initial.workspaceId,
          versionId: installed.versionId,
          releaseNumber: installed.releaseNumber,
          lineId: crypto.randomUUID(),
          priceVersion: price.version,
          amountCents: price.amountCents,
          currency: price.currency,
          periodStart: month.start,
          periodEnd: month.end,
        }),
        reviewed: { ...installed },
      };
    } catch {
      setFeedback("That month can’t be agreed here. Choose another price.");
      focus(origin);
      return;
    }
    const attempt = pending.current,
      controller = new AbortController();
    inflight.current = controller;
    setPhase("pending");
    setFeedback("");
    try {
      const response = await request(
        "/api/workspace/version-money-preparation",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(attempt.command),
          signal: controller.signal,
        },
      );
      if (!response.ok)
        throw Error(
          "Your answer couldn't be confirmed. Check what was saved.",
        );
      const receipt = neutralPaidVersionReceiptSchema.parse(
        await response.json(),
      );
      if (
        !neutralReviewedReceiptMatches(
          receipt,
          attempt.command,
          actorId,
          attempt.reviewed,
        )
      )
        throw Error(
          "What Strelva saved doesn't match what you chose. Check what was saved before going on.",
        );
      if (controller.signal.aborted || !alive.current) return;
      pending.current = null;
      setGraph((current) => ({
        ...current,
        history: [
          ...current.history.filter((item) => item.line_id !== receipt.line_id),
          receipt,
        ],
      }));
      setPhase("blocked");
      setFeedback(
        "Saved with your name. No card was charged.",
      );
      focus(origin);
    } catch (error) {
      if (!controller.signal.aborted && alive.current) {
        setPhase("uncertain");
        setFeedback(
          error instanceof Error
            ? error.message
            : "Your answer isn't confirmed yet.",
        );
        focus(origin);
      }
    } finally {
      if (!controller.signal.aborted && alive.current) inflight.current = null;
    }
  }
  const yesState: XaYesState = held.held
    ? "live"
    : phase === "pending" && !pending.current
      ? "waiting"
      : phase === "pending"
        ? "going"
        : "waiting";
  const sentence = (offer: Offer) =>
    `${offer.installed.name}: ${amountWords(offer.price.amountCents, offer.price.currency)} for ${periodWords(offer.month.start, offer.month.end) ?? offer.month.label}.`;
  const canAnswer = admitted && (!locked || (phase === "pending" && !!pending.current));
  return (
    <section aria-labelledby="version-money-heading" className={xa.section}>
      <h2 id="version-money-heading" className={xa.heading}>
        Prices for apps you added
      </h2>
      <p className={xa.body}>
        Some apps come from another agency, and they set a price for them.{" "}
        {graph.payerKind === "agency"
          ? "Your agency pays it."
          : "This business pays it."}{" "}
        Saying yes keeps the price and month with your name; nothing is charged
        here. The agency that made the app stays credited.
      </p>
      {!admitted ? (
        <p className={xa.body}>
          What you agreed to stays here. The business owner can agree to another
          month once a card is set up.
        </p>
      ) : !offers.length ? (
        <p className={xa.body}>No app price is waiting for your yes.</p>
      ) : (
        <OfferRows
          label="App prices waiting for your yes"
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
                  yesState === "going"
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
      )}
      <p
        role="status"
        aria-live="polite"
        tabIndex={-1}
        ref={status}
        className={xa.body}
      >
        {feedback}
      </p>
      {phase !== "ready" || pending.current ? (
        <XaButton
          variant="quiet"
          disabled={phase === "pending"}
          onClick={() => void reload()}
        >
          Check what was saved
        </XaButton>
      ) : null}
      {pending.current ? (
        <p className={xa.body}>
          Strelva hasn&apos;t confirmed your last answer yet. It stays exactly as
          you sent it while you check.
        </p>
      ) : null}
      <h3 className={xa.heading}>Months you agreed to</h3>
      {graph.history.length ? (
        <ul className={xa.section}>
          {graph.history.map((item) => (
            <li key={item.line_id} className={xa.body}>
              {item.price_version},{" "}
              {formatMoney(item.amountCents, item.currency).replace(
                /\.00$/,
                "",
              )}{" "}
              {periodWords(item.period_start, item.period_end)
                ? `for ${periodWords(item.period_start, item.period_end)}`
                : ""}
              .{" "}
              <span className={xa.note}>
                {item.accepted_by === actorId ? "You" : "The business owner"}{" "}
                agreed
                {shortLocalDay(item.accepted_at)
                  ? ` on ${shortLocalDay(item.accepted_at)}`
                  : ""}
                .
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={xa.note}>Nothing agreed yet.</p>
      )}
    </section>
  );
}
