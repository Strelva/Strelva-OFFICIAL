"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  XaButton,
  XaLabel,
  XaStatus,
  XaTextLink,
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
        })
        .passthrough(),
    ),
  })
  .passthrough();
type Inbox = z.infer<typeof inboxSchema>;

export function AgencyPayerRequests({
  agencyWorkspaceId,
  request = fetch,
}: {
  agencyWorkspaceId: string;
  request?: typeof fetch;
}) {
  return (
    <ScopedAgencyPayerRequests
      key={agencyWorkspaceId}
      agencyWorkspaceId={agencyWorkspaceId}
      request={request}
    />
  );
}

function ScopedAgencyPayerRequests({
  agencyWorkspaceId,
  request,
}: {
  agencyWorkspaceId: string;
  request: typeof fetch;
}) {
  const router = useRouter();
  const [requests, setRequests] = useState<Inbox["transitions"] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
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
        throw new Error(body.error ?? "Payer requests could not be loaded.");
      const parsed = inboxSchema.safeParse(body);
      if (!parsed.success)
        throw new Error("Payer requests could not be confirmed. Check again.");
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
            : "Payer requests could not be loaded.",
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
          value.error ?? "The payer response could not be confirmed.",
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
        throw new Error("The addressed payer decision could not be confirmed.");
      }
      apply(body);
      setNotice(
        resolved?.status === "stale"
          ? "The proposal expired because its proposer is no longer a business owner."
          : action === "accept"
            ? "Agency payer role accepted for future jobs. Each job limit still needs separate agreement."
            : "Payer proposal declined.",
      );
      router.refresh();
    } catch {
      if (!controller.signal.aborted) {
        try {
          await load(controller.signal);
          setNotice(
            "Outcome not confirmed. Payer requests have been checked again; review their current status before continuing.",
          );
        } catch {
          if (!controller.signal.aborted)
            setError(
              "Outcome not confirmed. Check payer requests before trying again.",
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

  return (
    <section
      className={styles.section}
      aria-labelledby="payer-requests-heading"
    >
      <XaLabel as="h2" id="payer-requests-heading">
        Owners asking your agency to pay
      </XaLabel>
      <p className={styles.note}>
        An owner proposes; your agency accepts here. Neither of you has to join
        the other&apos;s workspace.
      </p>
      {error ? (
        <p className={styles.critical} role="alert">
          {error}{" "}
          <XaTextLink
            onClick={() => {
              if (!busy)
                void load().catch(() =>
                  setError("Payer requests could not be loaded."),
                );
            }}
          >
            Check payer requests
          </XaTextLink>
        </p>
      ) : null}
      {notice ? (
        <p className={styles.body} role="status">
          {notice}
        </p>
      ) : null}
      {requests === null && !error ? (
        <p className={styles.note} role="status">
          Reading payer requests…
        </p>
      ) : requests?.length === 0 ? (
        <p className={styles.body}>
          No payer requests are waiting for this agency.
        </p>
      ) : null}
      {requests?.map((item) => (
        <div
          key={item.id}
          className={styles.waiting}
          role="group"
          aria-label={`Future jobs for ${item.workspaceName ?? "this business"}`}
        >
          <div className={styles.waitingHead}>
            <p className={styles.waitingTitle}>
              Future jobs for {item.workspaceName ?? "this business"}
            </p>
            <XaStatus kind="waits" size="sm">
              Waits for you
            </XaStatus>
          </div>
          <p className={styles.note}>
            {item.proposerEmail} asks your agency to pay for jobs started after
            you accept. Existing job limits and costs keep their payer.
            Accepting gives no access to the business&apos;s work.
          </p>
          <div className={styles.actions}>
            <XaButton
              size="sm"
              disabled={busy || Boolean(error)}
              onClick={() => void respond("accept", item.id)}
            >
              Accept future payer role
            </XaButton>
            <XaButton
              size="sm"
              variant="quiet"
              disabled={busy || Boolean(error)}
              onClick={() => void respond("reject", item.id)}
            >
              Not yet
            </XaButton>
          </div>
        </div>
      ))}
    </section>
  );
}
