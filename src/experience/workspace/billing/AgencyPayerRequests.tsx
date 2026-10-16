"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  XaHeadline,
  XaPebbleAvatar,
  XaTextLink,
  XaYes,
} from "@/components/ui/strelva/Xa";
import styles from "@/experience/workspace/money/money.module.css";

const inboxSchema = z
  .object({
    transitions: z.array(
      z
        .object({
          id: z.string().min(1),
          workspaceId: z.string().min(1),
          workspaceName: z.string().optional(),
          successorKind: z.enum(["agency", "business", "user"]),
          successorWorkspaceId: z.string().nullable(),
          status: z.enum([
            "pending",
            "accepted",
            "rejected",
            "revoked",
            "stale",
          ]),
          canRespond: z.boolean(),
          proposerEmail: z.string(),
          proposerName: z.string().nullable().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();
type Inbox = z.infer<typeof inboxSchema>;
type Request = Inbox["transitions"][number];

/** Whoever asked, by name; the email only when no name is recorded. */
export function proposerLabel(item: {
  proposerName?: string | null;
  proposerEmail: string;
}) {
  return item.proposerName?.trim() || item.proposerEmail;
}

type Payer = {
  agencyName: string;
  requests: Request[] | null;
  error: string;
  notice: string;
  busy: boolean;
  /** The ask that holds the one yes on the screen; the others wait their turn. */
  chosen: string | null;
  choose: (transitionId: string) => void;
  respond: (action: "accept" | "reject", transitionId: string) => void;
  retry: () => void;
};
const PayerContext = createContext<Payer | null>(null);

/** Owner requests for this agency to pay, as data other parts of the page can place on the client's own line. */
export function useAgencyPayerRequests() {
  return useContext(PayerContext);
}

/**
 * Owners asking the agency to pay for future jobs (XA · AG6). With children,
 * it only provides the requests: each one is drawn on its client's own line
 * (AgencyPayerRequestAsk) and the rest as extra lines in the same list
 * (AgencyPayerRequestLines). Without children it draws its own list.
 */
export function AgencyPayerRequests({
  agencyWorkspaceId,
  agencyName = "your agency",
  request = fetch,
  children,
}: {
  agencyWorkspaceId: string;
  agencyName?: string;
  request?: typeof fetch;
  children?: ReactNode;
}) {
  return (
    <ScopedAgencyPayerRequests
      key={agencyWorkspaceId}
      agencyWorkspaceId={agencyWorkspaceId}
      agencyName={agencyName}
      request={request}
    >
      {children ?? (
        <section
          className={styles.section}
          aria-label="Owners asking your agency to cover Strelva"
        >
          <AgencyPayerRequestsStatus />
          <ul
            className={styles.clientList}
            aria-label="Owners asking your agency to cover Strelva"
          >
            <AgencyPayerRequestLines listed={[]} />
          </ul>
        </section>
      )}
    </ScopedAgencyPayerRequests>
  );
}

function ScopedAgencyPayerRequests({
  agencyWorkspaceId,
  agencyName,
  request,
  children,
}: {
  agencyWorkspaceId: string;
  agencyName: string;
  request: typeof fetch;
  children: ReactNode;
}) {
  const router = useRouter();
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const inflight = useRef<AbortController | null>(null);
  const apply = useCallback(
    (body: Inbox) => {
      setRequests(
        body.transitions.filter(
          (item) =>
            item.successorKind === "agency" &&
            item.successorWorkspaceId === agencyWorkspaceId &&
            item.status === "pending" &&
            item.canRespond,
        ),
      );
    },
    [agencyWorkspaceId],
  );
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const response = await request("/api/work-economics/payer-transition", {
        cache: "no-store",
        signal,
      });
      const body = await response.json();
      if (signal?.aborted) return;
      if (!response.ok)
        throw new Error(body.error ?? "Owners' asks couldn't be read just now.");
      const parsed = inboxSchema.safeParse(body);
      if (!parsed.success)
        throw new Error("Owners' asks couldn't be read just now. Check again.");
      apply(parsed.data);
      setError("");
    },
    [request, apply],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((cause) => {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Owners' asks couldn't be read just now.",
        );
    });
    return () => {
      controller.abort();
      inflight.current?.abort();
    };
  }, [load]);

  async function respond(action: "accept" | "reject", transitionId: string) {
    if (inflight.current || error) return;
    const addressed = requests?.find((item) => item.id === transitionId);
    if (!addressed) return;
    const controller = new AbortController();
    inflight.current = controller;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await request("/api/work-economics/payer-transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, transitionId }),
        signal: controller.signal,
      });
      const value = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw new Error(
          value.error ?? "Your answer didn't go through. Nothing changed.",
        );
      const body = inboxSchema.parse(value);
      const matches = body.transitions.filter(
        (item) => item.id === transitionId,
      );
      const resolved = matches[0];
      if (
        matches.length !== 1 ||
        !resolved ||
        resolved.successorKind !== "agency" ||
        resolved.successorWorkspaceId !== agencyWorkspaceId ||
        resolved.workspaceId !== addressed.workspaceId ||
        ![action === "accept" ? "accepted" : "rejected", "stale"].includes(
          resolved.status,
        )
      ) {
        throw new Error("Your answer couldn't be confirmed. Nothing changed.");
      }
      apply(body);
      const business = addressed.workspaceName ?? "this business";
      setNotice(
        resolved?.status === "stale"
          ? `${proposerLabel(addressed)} no longer owns ${business}, so the ask ended.`
          : action === "accept"
            ? `You now cover Strelva for ${business}, counting from today. Larger pieces of work still ask you first.`
            : `You said not yet to paying for ${business}. ${proposerLabel(addressed)} can ask again.`,
      );
      router.refresh();
    } catch {
      if (!controller.signal.aborted) {
        try {
          await load(controller.signal);
          setNotice(
            "Strelva couldn't confirm your answer, so it read the asks again. Check where each one stands before answering.",
          );
        } catch {
          if (!controller.signal.aborted)
            setError(
              "Strelva couldn't confirm your answer. Check the asks before trying again.",
            );
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        inflight.current = null;
        setBusy(false);
      }
    }
  }

  const value: Payer = {
    agencyName,
    requests,
    error,
    notice,
    busy,
    chosen:
      requests?.find((item) => item.id === chosen)?.id ??
      requests?.[0]?.id ??
      null,
    choose: (id) => setChosen(id),
    respond: (action, id) => void respond(action, id),
    retry: () => {
      if (!busy)
        void load().catch(() =>
          setError("Owners' asks couldn't be read just now."),
        );
    },
  };
  return (
    <PayerContext.Provider value={value}>{children}</PayerContext.Provider>
  );
}

/** Loading, failure and what just happened, said once for the whole list. */
export function AgencyPayerRequestsStatus() {
  const payer = useAgencyPayerRequests();
  if (!payer) return null;
  if (payer.error)
    return (
      <p className={styles.critical} role="alert">
        {payer.error}{" "}
        <XaTextLink onClick={payer.retry}>Check again</XaTextLink>
      </p>
    );
  if (payer.notice)
    return (
      <p className={styles.body} role="status">
        {payer.notice}
      </p>
    );
  if (payer.requests === null)
    return (
      <p className={styles.note} role="status">
        Reading what owners asked…
      </p>
    );
  return null;
}

/** The ask, on the client's own line: who asked, what, and the two answers as text links. */
export function AgencyPayerRequestAsk({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const payer = useAgencyPayerRequests();
  const item = payer?.requests?.find(
    (entry) => entry.workspaceId === workspaceId,
  );
  if (!payer || !item) return null;
  return <Ask item={item} payer={payer} />;
}

function Ask({ item, payer }: { item: Request; payer: Payer }) {
  const business = item.workspaceName ?? "this business";
  const disabled = payer.busy || Boolean(payer.error);
  const current = payer.chosen === item.id;
  return (
    <span
      className={styles.ask}
      role="group"
      aria-label={`An ask from ${business}`}
    >
      <span>
        {proposerLabel(item)} asked {payer.agencyName} to cover Strelva for{" "}
        {business} from now on.
      </span>
      {current ? (
        <span className={styles.yesSlot}>
          <XaYes
            state={payer.busy ? "going" : "waiting"}
            yesLabel={`Cover ${business}`}
            yesAriaLabel={`Cover Strelva for ${business}`}
            notYetLabel="Not yet"
            notYetAriaLabel={`Not yet for ${business}`}
            block={false}
            disabled={Boolean(payer.error)}
            onYes={() => payer.respond("accept", item.id)}
            onNotYet={disabled ? undefined : () => payer.respond("reject", item.id)}
            working={{
              title: "Saving your answer",
              steps: [
                {
                  id: "accept",
                  label: "Keeping your answer with your name",
                  state: "active",
                },
              ],
            }}
          />
        </span>
      ) : (
        <span className={styles.links}>
          <XaTextLink
            disabled={disabled}
            onClick={() => payer.choose(item.id)}
            aria-label={`Answer ${business}`}
          >
            Answer this one
          </XaTextLink>
        </span>
      )}
    </span>
  );
}

/** Requests from businesses that are not on the list yet, as lines in the same list. */
export function AgencyPayerRequestLines({
  listed,
}: {
  listed: readonly string[];
  /** Kept for callers; client lines carry no colored tile (October 16). */
  colors?: Readonly<Record<string, string>>;
}) {
  const payer = useAgencyPayerRequests();
  if (!payer?.requests) return null;
  const rest = payer.requests.filter(
    (item) => !listed.includes(item.workspaceId),
  );
  // Nothing waits: Pebble says how an owner asks, once, instead of repeating the headline.
  if (!rest.length)
    return listed.length ? null : (
      <li className={styles.pebbleNote}>
        <XaPebbleAvatar size={32} />
        <p className={styles.body}>
          Owners ask from their own Plan and usage page, under Who pays for
          Strelva work.
        </p>
      </li>
    );
  return (
    <>
      {rest.map((item) => (
        <li key={item.id} className={styles.clientLine}>
          <div className={styles.clientText}>
            <span>{item.workspaceName ?? "A business"}</span>
            <Ask item={item} payer={payer} />
          </div>
        </li>
      ))}
    </>
  );
}

/**
 * Agency billing's headline: only coverage the agency accepted counts. A
 * client whose owner is still asking is counted as asking, never as covered.
 */
export function AgencyCoverHeadline({
  agencyName,
  clientIds,
  quiet,
  id,
}: {
  agencyName: string;
  /** Active client lines on the billing record. */
  clientIds: readonly string[];
  quiet: string;
  id?: string;
}) {
  const payer = useAgencyPayerRequests();
  const asking = new Set((payer?.requests ?? []).map((item) => item.workspaceId));
  const covered = clientIds.filter((clientId) => !asking.has(clientId)).length;
  const count = (n: number) => (n === 1 ? "1 client" : `${n} clients`);
  return (
    <XaHeadline id={id} quiet={quiet}>
      {covered
        ? `${agencyName} covers Strelva for ${count(covered)}${asking.size ? `, ${asking.size} more asking` : ""}.`
        : asking.size
          ? `${count(asking.size)} ${asking.size === 1 ? "asks" : "ask"} ${agencyName} to cover Strelva.`
          : `${agencyName} doesn’t cover Strelva for any client yet.`}
    </XaHeadline>
  );
}
