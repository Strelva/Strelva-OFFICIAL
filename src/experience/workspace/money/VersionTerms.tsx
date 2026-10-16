"use client";
import { XaButton, XaSelect } from "@/components/ui/strelva/Xa";
import xa from "@/experience/workspace/money/money.module.css";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatMoney } from "@/platform/connect/money-format";
import { monthChoices, periodWords, shortLocalDay } from "./period";
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
export function VersionTerms(props: {
  graph: NeutralVersionMoneyGraph;
  actorId: string;
  request?: typeof fetch;
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
}: {
  graph: NeutralVersionMoneyGraph;
  actorId: string;
  request?: typeof fetch;
}) {
  const [graph, setGraph] = useState(initial),
    [phase, setPhase] = useState<"ready" | "pending" | "uncertain" | "blocked">(
      "ready",
    ),
    [feedback, setFeedback] = useState("");
  const [versionId, setVersionId] = useState(""),
    [priceVersion, setPriceVersion] = useState(""),
    [month, setMonth] = useState(() => monthChoices(1)[0]!.value),
    [fieldError, setFieldError] = useState("");
  const months = monthChoices();
  const chosenMonth = months.find((item) => item.value === month);
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
  const installed = graph.installations.find(
      (item) => item.versionId === versionId,
    ),
    prices = graph.prices.filter(
      (item) => item.definitionId === installed?.definitionId,
    ),
    price = prices.find((item) => item.version === priceVersion);
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
  async function accept(event: FormEvent) {
    event.preventDefault();
    if (inflight.current || locked || !admitted) return;
    if (!installed?.qualified || !installed.released) {
      setFieldError("Choose the app this price is for.");
      return;
    }
    if (!price) {
      setFieldError("Choose the price you're agreeing to.");
      return;
    }
    setFieldError("");
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
          periodStart: chosenMonth?.start,
          periodEnd: chosenMonth?.end,
        }),
        reviewed: { ...installed },
      };
    } catch {
      setFeedback("Choose the month it covers.");
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
        here.
      </p>
      {!admitted ? (
        <p className={xa.body}>
          What you agreed to stays here. The business owner can agree to another
          month once a card is set up.
        </p>
      ) : (
        <div className={xa.block}>
          <form
            onSubmit={(event) => void accept(event)}
            className={xa.form}
            noValidate
          >
            <XaSelect
              label="App"
              value={versionId}
              disabled={locked}
              error={!installed && fieldError ? fieldError : undefined}
              onChange={(event) => {
                setFieldError("");
                setVersionId(event.target.value);
                setPriceVersion("");
              }}
              options={[
                { value: "", label: "Choose an app" },
                ...graph.installations
                  .filter((item) => item.qualified && item.released)
                  .map((item) => ({
                    value: item.versionId,
                    label: item.releaseNumber
                      ? `${item.name}, Release ${item.releaseNumber}`
                      : item.name,
                  })),
              ]}
            />
            <XaSelect
              label="Price"
              value={priceVersion}
              disabled={locked}
              error={installed && !price && fieldError ? fieldError : undefined}
              onChange={(event) => {
                setPriceVersion(event.target.value);
                setFieldError("");
              }}
              options={[
                { value: "", label: "Choose a price" },
                ...prices.map((item) => ({
                  value: item.version,
                  label: `${item.version}, ${formatMoney(item.amountCents, item.currency)}`,
                })),
              ]}
            />
            {installed ? (
              <p className={xa.note}>
                {installed.name}
                {installed.releaseNumber
                  ? `, Release ${installed.releaseNumber}`
                  : ""}
                . The agency that made it stays credited.
              </p>
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
            {price && chosenMonth ? (
              <p className={xa.body}>
                {formatMoney(price.amountCents, price.currency)} for{" "}
                {chosenMonth.label}.
              </p>
            ) : null}
            <XaButton type="submit" busy={phase === "pending"} disabled={locked}>
              Agree to this price
            </XaButton>
          </form>
        </div>
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
