"use client";
import { XaButton, XaField, XaSelect } from "@/components/ui/strelva/Xa";
import xa from "@/experience/workspace/money/money.module.css";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatMoney } from "@/platform/connect/money-format";
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
const recordedDay = (iso: string | null | undefined) => {
  const value = iso ? new Date(iso) : null;
  return value && Number.isFinite(value.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
      }).format(value)
    : "not recorded";
};
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
  async function reload() {
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
        throw Error("Current paid Version terms could not be loaded.");
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
          "Your exact paid Version period is recorded. Payment collection remains unconfigured.",
        );
      } else if (pending.current)
        setFeedback(
          "The original acceptance is unconfirmed. Reload again before creating another request.",
        );
      setPhase(pending.current ? "uncertain" : "ready");
      focus(origin);
    } catch (error) {
      if (!controller.signal.aborted && alive.current) {
        setPhase("blocked");
        setFeedback(
          error instanceof Error
            ? error.message
            : "The recorded terms could not be confirmed.",
        );
        focus(origin);
      }
    } finally {
      if (!controller.signal.aborted && alive.current) inflight.current = null;
    }
  }
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
          "Acceptance could not be confirmed. Reload to check the original request.",
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
          "The acceptance receipt changed the reviewed Version or terms. Reload before continuing.",
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
        "Your exact paid Version period is recorded. No payment was collected. Reload current permission before accepting another period.",
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
        Installed Version terms
      </h2>
      <p>
        Recorded payer:{" "}
        {graph.payerKind === "agency" ? "The paying agency" : "This business"}.
        Current payer approval and its payment mandate remain separate.
      </p>
      <p>
        Choose a released Version and its written price. This records a paid
        period and the original creator lineage. A payment mandate and
        collection remain separate.
      </p>
      {!admitted ? (
        <p>
          History remains available. A current business owner and configured
          payment details are required to accept another period.
        </p>
      ) : (
        <div className={xa.block}>
          <form onSubmit={(event) => void accept(event)} className={xa.form}>
            <XaSelect
              label="Released Version"
              value={versionId}
              disabled={locked}
              required
              onChange={(event) => {
                setVersionId(event.target.value);
                setPriceVersion("");
              }}
              options={[
                { value: "", label: "Choose an installed Version" },
                ...graph.installations
                  .filter((item) => item.qualified && item.released)
                  .map((item) => ({ value: item.versionId, label: item.name })),
              ]}
            />
            <XaSelect
              label="Written Version price"
              value={priceVersion}
              disabled={locked}
              required
              onChange={(event) => setPriceVersion(event.target.value)}
              options={[
                { value: "", label: "Choose a recorded price" },
                ...prices.map((item) => ({
                  value: item.version,
                  label: `${item.version} · ${formatMoney(item.amountCents, item.currency)}`,
                })),
              ]}
            />
            {installed ? (
              <p className={xa.note}>
                Installed from{" "}
                {installed.releaseNumber
                  ? `release ${installed.releaseNumber}`
                  : "a release"}{" "}
                of its creator&apos;s source. The creator stays credited.
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
              <p>
                {formatMoney(price.amountCents, price.currency)} for the chosen
                period.
              </p>
            ) : null}
            <XaButton
              type="submit"
              disabled={locked || !installed || !price || !start || !end}
            >
              Accept this Version period
            </XaButton>
          </form>
        </div>
      )}
      <p role="status" aria-live="polite" tabIndex={-1} ref={status}>
        {feedback}
      </p>
      <XaButton
        variant="quiet"
        disabled={phase === "pending"}
        onClick={() => void reload()}
      >
        Reload Version terms and history
      </XaButton>
      {pending.current ? (
        <p className={xa.body}>
          Your last acceptance is not confirmed yet. It is held exactly as sent
          while you check the history.
        </p>
      ) : null}
      <h3>Accepted Version periods</h3>
      {graph.history.length ? (
        <ul className={xa.section}>
          {graph.history.map((item) => (
            <li key={item.line_id} className={xa.body}>
              {item.price_version} ·{" "}
              {formatMoney(item.amountCents, item.currency)} ·{" "}
              {recordedDay(item.period_start)} to {recordedDay(item.period_end)}
              . Terms recorded by{" "}
              {item.accepted_by === actorId ? "you" : "a business owner"};
              collection is not set up.
            </li>
          ))}
        </ul>
      ) : (
        <p>No paid Version period has been recorded.</p>
      )}
    </section>
  );
}
