"use client";
import { XaButton, XaField, XaSelect } from "@/components/ui/strelva/Xa";
import xa from "@/experience/workspace/money/money.module.css";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatMoney } from "@/platform/connect/money-format";
import { periodWords, shortLocalDay } from "./period";
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
    [start, setStart] = useState(""),
    [end, setEnd] = useState("");
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
        throw Error("Prices for installed Systems could not be loaded.");
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
          "Your exact paid Version period is recorded. Charging a card stays a separate step.",
        );
      } else if (pending.current)
        setFeedback(
          "Your last answer is still not confirmed. Check again before agreeing to anything else.",
        );
      setPhase(pending.current ? "uncertain" : "ready");
      if (!silent) focus(origin);
    } catch (error) {
      if (!controller.signal.aborted && alive.current) {
        setPhase("blocked");
        setFeedback(
          error instanceof Error
            ? error.message
            : "The recorded terms could not be confirmed.",
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
    if (
      inflight.current ||
      locked ||
      !admitted ||
      !installed?.qualified ||
      !installed.released ||
      !price
    )
      return;
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
          periodStart: new Date(start).toISOString(),
          periodEnd: new Date(end).toISOString(),
        }),
        reviewed: { ...installed },
      };
    } catch {
      setFeedback("Choose an explicit valid period ending after it starts.");
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
          "Your answer could not be confirmed. Check what was recorded.",
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
          "The acceptance receipt changed the reviewed Version or terms. Check what was recorded before continuing.",
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
        "Your exact paid Version period is recorded. No payment was collected.",
      );
      focus(origin);
    } catch (error) {
      if (!controller.signal.aborted && alive.current) {
        setPhase("uncertain");
        setFeedback(
          error instanceof Error
            ? error.message
            : "Acceptance remains unconfirmed.",
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
        Prices for Systems you installed
      </h2>
      <p className={xa.body}>
        {graph.payerKind === "agency"
          ? "Your agency pays"
          : "This business pays"}
        . Pick a System you installed from another creator and its written
        price. Agreeing records the dates it covers and keeps the creator
        credited. Charging a card stays a separate step.
      </p>
      {!admitted ? (
        <p className={xa.body}>
          What you agreed to stays here. A current business owner with payment
          details set up can agree to another period.
        </p>
      ) : (
        <div className={xa.block}>
          <form onSubmit={(event) => void accept(event)} className={xa.form}>
            <XaSelect
              label="System"
              value={versionId}
              disabled={locked}
              required
              onChange={(event) => {
                setVersionId(event.target.value);
                setPriceVersion("");
              }}
              options={[
                { value: "", label: "Choose an installed System" },
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
              label="Written price"
              value={priceVersion}
              disabled={locked}
              required
              onChange={(event) => setPriceVersion(event.target.value)}
              options={[
                { value: "", label: "Choose a written price" },
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
                . Its creator stays credited.
              </p>
            ) : null}
            <XaField
              label="Period starts (your local time)"
              type="datetime-local"
              value={start}
              required
              disabled={locked}
              onChange={(event) => setStart(event.target.value)}
            />
            <XaField
              label="Period ends (your local time)"
              type="datetime-local"
              value={end}
              required
              disabled={locked}
              onChange={(event) => setEnd(event.target.value)}
            />
            {price ? (
              <p className={xa.body}>
                {formatMoney(price.amountCents, price.currency)} for the chosen
                period.
              </p>
            ) : null}
            <XaButton
              type="submit"
              disabled={locked || !installed || !price || !start || !end}
            >
              Accept this period
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
          Check what was recorded
        </XaButton>
      ) : null}
      {pending.current ? (
        <p className={xa.body}>
          Your last acceptance is not confirmed yet. It is held exactly as sent
          while you check the history.
        </p>
      ) : null}
      <h3 className={xa.heading}>Periods you agreed to</h3>
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
                {item.accepted_by === actorId ? "You" : "A business owner"}{" "}
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
        <p className={xa.note}>No paid Version period has been recorded.</p>
      )}
    </section>
  );
}
