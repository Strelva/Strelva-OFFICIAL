"use client";
import { XaButton, XaField, XaSelect } from "@/components/ui/strelva/Xa";
import xa from "@/experience/workspace/money/money.module.css";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  beginFocusRecovery,
  type FocusRecovery,
} from "@/experience/websites/focus-recovery";
import type { CreatorMaintenanceGraph } from "@/platform/connect/creator-maintenance";

// The existing wire receipt, validated without importing the server/db module.
const receiptSchema = z
  .object({
    id: z.uuid(),
    listing_id: z.uuid(),
    maintainer_state: z.enum(["creator", "takeover", "tapered"]),
    agreement_version: z.string().nullable(),
    rate_reference: z.string().nullable(),
    effective_from: z.string().datetime({ offset: true }),
    recorded_by: z.uuid(),
    recorded_at: z.string().datetime({ offset: true }),
  })
  .strict();
/** A moment in the owner's local time, without a zone id. */
const recordedDay = (iso: string | null | undefined) => {
  const value = iso ? new Date(iso) : null;
  return value && Number.isFinite(value.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(value)
    : "a date that was not recorded";
};
const STATE_WORDS = {
  creator: "The creator maintains it",
  tapered: "The creator's share tapers",
  takeover: "Taken over; the creator stops earning on future payments",
} as const;
const unknownMessage =
  "This maintenance change could not be confirmed. Reload its history before recording different terms.";

export default function CreatorMaintenance({
  graph,
  listingNames = {},
}: {
  graph: CreatorMaintenanceGraph;
  /** "Dental intake, Release 2", by listing source revision id, from the creator's own sources. */
  listingNames?: Readonly<Record<string, string>>;
}) {
  const nameOf = (listing: { sourceRevisionId: string }, index: number) =>
    listingNames[listing.sourceRevisionId] ?? `Listed System ${index + 1}`;
  const rateOf = (version: string | null | undefined) => {
    const agreement = graph.agreements.find((item) => item.version === version);
    return agreement ? `${agreement.rateBps / 100}% of each payment` : null;
  };
  const router = useRouter();
  const active = useRef(true);
  const pending = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const blocked = useRef(false);
  const currentAuthority = useRef(graph.canMaintain);
  currentAuthority.current = graph.canMaintain;
  const submittedGraph = useRef<CreatorMaintenanceGraph | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const receiptRef = useRef<HTMLParagraphElement>(null);
  const reloadRef = useRef<HTMLButtonElement>(null);
  const focusRecovery = useRef<FocusRecovery | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      pending.current?.abort();
      focusRecovery.current?.cancel();
    };
  }, []);
  const [listingId, setListingId] = useState("");
  const [state, setState] = useState("");
  const [agreementIndex, setAgreementIndex] = useState("");
  const [effective, setEffective] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const draftGraph =
    (busy || unconfirmed) && submittedGraph.current
      ? submittedGraph.current
      : graph;
  const listing = draftGraph.listings.find((item) => item.id === listingId);
  const agreement =
    agreementIndex === ""
      ? undefined
      : draftGraph.agreements[Number(agreementIndex)];
  useEffect(() => {
    if (!focusRecovery.current || (busy && graph.canMaintain)) return;
    focusRecovery.current.recover(
      !graph.canMaintain
        ? historyRef.current
        : unconfirmed
          ? reloadRef.current
          : receipt
            ? receiptRef.current
            : errorRef.current,
      true,
    );
    focusRecovery.current = null;
  }, [busy, error, receipt, unconfirmed, graph.canMaintain]);
  function changeDraft(change: () => void) {
    if (inFlight.current || blocked.current || !currentAuthority.current)
      return;
    submittedGraph.current = null;
    setError(null);
    setReceipt(null);
    change();
  }
  function invalidInput(message: string) {
    setError(message);
    // Repeated identical validation can leave React state unchanged.
    if (error === message && errorRef.current) {
      focusRecovery.current?.recover(errorRef.current, true);
      focusRecovery.current = null;
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || blocked.current || !currentAuthority.current)
      return;
    focusRecovery.current?.cancel();
    focusRecovery.current = beginFocusRecovery(sectionRef.current);
    setError(null);
    setReceipt(null);
    if (!listing || !["creator", "takeover", "tapered"].includes(state)) {
      invalidInput("Choose a listing and maintenance state.");
      return;
    }
    const date = new Date(effective);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
      invalidInput("Choose a future maintenance date.");
      return;
    }
    if (
      state !== "takeover" &&
      (!agreement ||
        date.getTime() < Date.parse(agreement.effectiveFrom) ||
        (agreement.effectiveUntil &&
          date.getTime() >= Date.parse(agreement.effectiveUntil)))
    ) {
      invalidInput(
        "Choose a recorded agreement covering this maintenance date.",
      );
      return;
    }
    const command = {
      workspaceId: graph.workspaceId,
      listingId: listing.id,
      sourceRevisionId: listing.sourceRevisionId,
      state,
      effectiveFrom: date.toISOString(),
      ...(state !== "takeover"
        ? {
            agreementVersion: agreement!.version,
            rateReference: agreement!.rateReference,
          }
        : {}),
    };
    inFlight.current = true;
    submittedGraph.current = graph;
    setBusy(true);
    const controller = new AbortController();
    pending.current = controller;
    try {
      const result = await fetch("/api/workspace/creator-maintenance", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const value: unknown = await result.json().catch(() => null);
      if (!active.current || controller.signal.aborted) return;
      if (!result.ok) {
        // These route refusals occur before mutation, or roll back the RPC.
        // A 503 or unrecognized response can follow a committed RPC receipt.
        const definitiveRefusal = [400, 401, 403, 409, 413, 415, 429].includes(
          result.status,
        );
        if (!definitiveRefusal) {
          blocked.current = true;
          setUnconfirmed(true);
          setError(unknownMessage);
        } else {
          submittedGraph.current = null;
          const refusal = z.object({ error: z.string() }).safeParse(value);
          setError(
            refusal.success
              ? refusal.data.error
              : "Maintenance was not recorded. Check these terms before trying again.",
          );
        }
        return;
      }
      const parsed = receiptSchema.safeParse(value);
      if (
        !parsed.success ||
        parsed.data.listing_id !== command.listingId ||
        parsed.data.maintainer_state !== command.state ||
        parsed.data.agreement_version !== (command.agreementVersion ?? null) ||
        parsed.data.rate_reference !== (command.rateReference ?? null) ||
        Date.parse(parsed.data.effective_from) !==
          Date.parse(command.effectiveFrom)
      ) {
        blocked.current = true;
        setUnconfirmed(true);
        setError(unknownMessage);
        return;
      }
      setReceipt(
        `Maintenance terms recorded for ${recordedDay(parsed.data.effective_from)}. No payment or agency change was made.`,
      );
      submittedGraph.current = null;
      router.refresh();
    } catch {
      if (active.current && !controller.signal.aborted) {
        blocked.current = true;
        setUnconfirmed(true);
        setError(unknownMessage);
      }
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
      if (pending.current === controller) pending.current = null;
    }
  }
  return (
    <div ref={sectionRef} className={xa.form}>
      <div className={xa.block}>
        <h2 ref={historyRef} tabIndex={-1} className={xa.heading}>
          Systems you list
        </h2>
        {graph.listings.length ? (
          <ul className={xa.section}>
            {graph.listings.map((item, index) => (
              <li key={item.id}>
                <h3 className={xa.heading}>{nameOf(item, index)}</h3>
                <p className={xa.body}>
                  {STATE_WORDS[item.maintainerState]}
                  {item.agreementVersion
                    ? ` under ${item.agreementVersion}${rateOf(item.agreementVersion) ? `, ${rateOf(item.agreementVersion)}` : ""}`
                    : ", with no written agreement yet"}
                  .
                </p>
                {item.history.length ? (
                  <ul
                    className={xa.section}
                    aria-label={`Maintenance history for ${nameOf(item, index)}`}
                  >
                    {item.history.map((entry) => (
                      <li key={entry.id} className={xa.body}>
                        {STATE_WORDS[entry.maintainer_state]} from{" "}
                        {recordedDay(entry.effective_from)}
                        {entry.agreement_version
                          ? `, under ${entry.agreement_version}`
                          : ""}
                        .
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={xa.note}>
                    No later maintenance terms are recorded.
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className={xa.body}>
            No System is listed yet. A System needs to be published and have a
            written creator agreement before it can be listed.
          </p>
        )}
      </div>
      {graph.listings.length && graph.canMaintain ? (
        <div className={xa.block}>
          <h2 className={xa.heading}>Change who maintains a listed System</h2>
          <p className={xa.note}>
            A takeover ends the creator&apos;s share of future payments. Keeping
            the creator, or tapering their share, uses a written agreement. This
            records the terms only; it moves no money and hands over no work.
          </p>
          {!draftGraph.agreements.length ? (
            <p className={xa.body} role="status">
              No written creator agreement is recorded yet, so only a takeover
              can be chosen.
            </p>
          ) : null}
          <form onSubmit={save} className={xa.form}>
            <XaSelect
              label="System"
              required
              disabled={busy || unconfirmed}
              value={listingId}
              onChange={(event) =>
                changeDraft(() => setListingId(event.target.value))
              }
              options={[
                { value: "", label: "Choose a listed System" },
                ...draftGraph.listings.map((item, index) => ({
                  value: item.id,
                  label: nameOf(item, index),
                })),
              ]}
            />
            <XaSelect
              label="Who maintains it"
              required
              disabled={busy || unconfirmed}
              value={state}
              onChange={(event) =>
                changeDraft(() => setState(event.target.value))
              }
              options={[
                { value: "", label: "Choose who maintains it" },
                {
                  value: "takeover",
                  label: "Take it over; the creator stops earning",
                },
                ...(draftGraph.agreements.length
                  ? [
                      {
                        value: "creator",
                        label: "The creator keeps maintaining it",
                      },
                      {
                        value: "tapered",
                        label: "The creator's share tapers",
                      },
                    ]
                  : []),
              ]}
            />
            {state && state !== "takeover" ? (
              <XaSelect
                label="Written agreement"
                required
                disabled={busy || unconfirmed}
                value={agreementIndex}
                onChange={(event) =>
                  changeDraft(() => setAgreementIndex(event.target.value))
                }
                options={[
                  { value: "", label: "Choose an agreement" },
                  ...draftGraph.agreements.map((item, index) => ({
                    value: String(index),
                    label: `${item.version}, ${item.rateBps / 100}% of each payment`,
                  })),
                ]}
              />
            ) : null}
            <XaField
              label="Starts"
              type="datetime-local"
              required
              disabled={busy || unconfirmed}
              value={effective}
              onChange={(event) =>
                changeDraft(() => setEffective(event.target.value))
              }
              hint="Your local time. Strelva checks the agreement again before recording it."
            />
            <XaButton type="submit" disabled={busy || unconfirmed}>
              {busy ? "Recording…" : "Record these terms"}
            </XaButton>
          </form>
        </div>
      ) : graph.listings.length ? (
        <p role="status">
          This workspace has ended, so maintenance can no longer change. What
          was recorded stays here.
        </p>
      ) : null}
      {error ? (
        <p ref={errorRef} tabIndex={-1} role="alert">
          {error}
        </p>
      ) : null}
      {unconfirmed ? (
        <div>
          <XaButton
            ref={reloadRef}
            type="button"
            variant="quiet"
            onClick={() => {
              if (!inFlight.current) window.location.reload();
            }}
          >
            Reload maintenance history
          </XaButton>
        </div>
      ) : null}
      {receipt ? (
        <p ref={receiptRef} tabIndex={-1} role="status">
          {receipt}
        </p>
      ) : null}
    </div>
  );
}
