"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  XaButton,
  XaField,
  XaHeadline,
  XaLabel,
  XaRow,
  XaRows,
  XaSays,
  XaSegmented,
  XaStatus,
  XaTextArea,
  XaTextLink,
} from "@/components/ui/strelva/Xa";
import type { AgencyPayLink } from "@/platform/agency-pay-links/types";
import { AgencyMerchantSetup } from "./AgencyMerchantSetup";
import type { PayLinkConfig } from "@/platform/infra/pay-links";
import type { readAgencyPaymentLinks } from "./payment-links-server";
import styles from "@/experience/workspace/money/money.module.css";

type Snapshot = Awaited<ReturnType<typeof readAgencyPaymentLinks>>;
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
const exact = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
const connectedPrice = (link: AgencyPayLink) =>
  link.amountCents !== null
    ? exact(link.amountCents)
    : `${exact(link.minCents ?? 0)} to ${exact(link.maxCents ?? 0)}`;
const price = (link: PayLinkConfig) =>
  link.amountCents !== undefined
    ? money(link.amountCents)
    : `${money(link.minCents ?? 0)} to ${money(link.maxCents ?? 0)}`;
const day = (iso: string | null) => {
  const value = iso ? new Date(iso) : null;
  return value && Number.isFinite(value.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(value)
    : "";
};

function confirmedLink(
  value: unknown,
  body: Record<string, unknown>,
  agencyId: string,
): value is PayLinkConfig {
  if (!value || typeof value !== "object") return false;
  const link = value as PayLinkConfig;
  if (
    typeof link.slug !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(link.slug) ||
    typeof link.createdAt !== "string" ||
    !Number.isFinite(Date.parse(link.createdAt))
  )
    return false;
  if (body.action === "create")
    return (
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(link.slug) &&
      (link as { clientName?: string }).clientName === body.clientName
    );
  if (body.action === "revoke")
    return (
      link.slug === body.slug &&
      (!link.agencyWorkspaceId || link.agencyWorkspaceId === agencyId) &&
      typeof link.revokedAt === "string" &&
      Number.isFinite(Date.parse(link.revokedAt)) &&
      typeof link.revokedBy === "string"
    );
  return false;
}

type LinkForm = {
  clientName: string;
  description: string;
  kind: "fixed" | "range";
  dollars: string;
  minDollars: string;
  maxDollars: string;
};
const blankForm: LinkForm = {
  clientName: "",
  description: "",
  kind: "fixed",
  dollars: "",
  minDollars: "",
  maxDollars: "",
};
type ProspectPrefill = { token?: string; name: string; description: string };

/**
 * What the client will see, drawn from the form as it is typed (Stripe and
 * Square show the page beside the form). Null until there is a real amount:
 * the preview never shows a made-up figure.
 */
function previewAmount(form: LinkForm): string | null {
  if (form.kind === "fixed")
    return /^\d+(\.\d{1,2})?$/.test(form.dollars.trim()) &&
      Number(form.dollars) > 0
      ? exact(Math.round(Number(form.dollars) * 100))
      : null;
  const low = Number(form.minDollars),
    high = Number(form.maxDollars);
  return form.minDollars.trim() &&
    form.maxDollars.trim() &&
    Number.isFinite(low) &&
    Number.isFinite(high) &&
    low > 0 &&
    high >= low
    ? `${money(low * 100)} to ${money(high * 100)}`
    : null;
}

export function AgencyPaymentLinks({
  agencyWorkspaceId,
  initialProspect,
  request = fetch,
}: {
  agencyWorkspaceId: string;
  initialProspect?: ProspectPrefill;
  request?: typeof fetch;
}) {
  return (
    <ScopedPaymentLinks
      key={agencyWorkspaceId}
      agencyWorkspaceId={agencyWorkspaceId}
      request={request}
      initialProspect={initialProspect}
    />
  );
}

function ScopedPaymentLinks({
  agencyWorkspaceId,
  request,
  initialProspect,
}: {
  agencyWorkspaceId: string;
  request: typeof fetch;
  initialProspect?: ProspectPrefill;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"clientName" | "description" | "amount" | "range", string>>
  >({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [form, setForm] = useState<LinkForm>(() => ({
    ...blankForm,
    clientName: initialProspect?.name ?? "",
    description: initialProspect?.description ?? "",
  }));
  const flight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const response = await request(
          `/api/agency/payment-links?agencyWorkspaceId=${encodeURIComponent(agencyWorkspaceId)}`,
          { cache: "no-store", signal },
        );
        const value = await response.json();
        if (
          !response.ok ||
          value.agency?.id !== agencyWorkspaceId ||
          typeof value.currentActorId !== "string" ||
          !Array.isArray(value.payLinks) ||
          !Array.isArray(value.clients) ||
          typeof value.legacyMerchant !== "boolean" ||
          !value.checkoutAvailability ||
          !value.paidPayments ||
          !Array.isArray(value.connectedLinks) ||
          !value.creation
        )
          throw new Error(value.error || "Payment links could not be read.");
        if (!signal?.aborted && mounted.current) {
          setSnapshot(value);
          setStale(false);
        }
      } catch (cause) {
        if (!signal?.aborted && mounted.current) {
          setStale(true);
          setError(
            cause instanceof Error
              ? cause.message
              : "Payment links could not be read.",
          );
        }
      } finally {
        if (!signal?.aborted && mounted.current) setLoading(false);
      }
    },
    [agencyWorkspaceId, request],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  // Read the links again whenever the agency comes back to this tab (from
  // Stripe, or after sending a link), instead of a Refresh control.
  const quiet = useRef({ busy: false, loading: false });
  quiet.current = { busy, loading };
  useEffect(() => {
    let last = Date.now();
    const back = () => {
      if (document.visibilityState === "hidden") return;
      if (quiet.current.busy || quiet.current.loading || flight.current) return;
      if (Date.now() - last < 5000) return;
      last = Date.now();
      void load();
    };
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);
    return () => {
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", back);
    };
  }, [load]);

  async function command(body: Record<string, unknown>) {
    if (flight.current || !snapshot || stale) return;
    const replaying = pending !== null;
    flight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setPending(body);
    try {
      const response = await request("/api/agency/payment-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const value = await response.json();
      if (!mounted.current) return;
      if (
        !response.ok ||
        !confirmedLink(value.payLink, body, agencyWorkspaceId)
      ) {
        if (!replaying && [400, 409, 403, 401].includes(response.status))
          setPending(null);
        throw new Error(
          value.error ||
            "That didn't go through, or Strelva couldn't confirm it. Try the same link again to see what was saved.",
        );
      }
      setPending(null);
      setRevoking(null);
      if (body.action === "create") {
        setForm(blankForm);
        setMessage(
          `The link for ${String(body.clientName)} is ready. Copy it and send it yourself; Strelva doesn't email it.`,
        );
      } else
        setMessage(
          "The link is stopped. Nobody new can pay with it, though a payment already under way in Stripe can still finish.",
        );
      await load();
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Strelva couldn't confirm that. Try the same link again to see what was saved.",
        );
    } finally {
      flight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function copy(slug: string) {
    try {
      await navigator.clipboard.writeText(
        new URL(`/pay/${slug}`, window.location.origin).toString(),
      );
      setError("");
      setMessage("Link copied.");
    } catch {
      setMessage("");
      setError(
        "The link couldn't be copied. Open it and copy the address from your browser.",
      );
    }
  }
  const disabled = busy || loading || stale || !!pending;
  function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    if (disabled || !snapshot) return;
    const body: Record<string, unknown> = {
      action: "create",
      agencyWorkspaceId,
      expectedActorId: snapshot.currentActorId,
      idempotencyKey: crypto.randomUUID(),
      clientName: form.clientName.trim(),
      description: form.description.trim(),
    };
    const problems: typeof fieldErrors = {};
    if (!body.clientName) problems.clientName = "Say who pays.";
    if (!body.description)
      problems.description = "Say what the payment is for.";
    const dollars = form.dollars.trim().replace(/^\$/, "").replace(/,/g, "");
    if (
      form.kind === "fixed" &&
      (!/^\d+(\.\d{1,2})?$/.test(dollars) ||
        Number(dollars) < 1 ||
        Number(dollars) > 1000000)
    )
      problems.amount = "Write an amount of at least 1 dollar, like 1250.50.";
    if (form.kind === "range") {
      const low = Number(form.minDollars),
        high = Number(form.maxDollars);
      if (
        !Number.isInteger(low) ||
        !Number.isInteger(high) ||
        low < 50 ||
        high > 10000 ||
        low > high ||
        (high - low) % 50 !== 0
      )
        problems.range =
          "Use whole dollars from 50 to 10,000, with the gap between them in steps of 50.";
    }
    setFieldErrors(problems);
    if (Object.keys(problems).length) return;
    if (form.kind === "fixed") {
      body.amountCents = Math.round(Number(dollars) * 100);
    } else {
      const low = Number(form.minDollars),
        high = Number(form.maxDollars);
      body.minCents = low * 100;
      body.maxCents = high * 100;
    }
    void command(body);
  }
  const expireConfirm = (slug: string) => (
    <span className={styles.links} role="group" aria-label="Stop this link">
      <span>
        Nobody new can pay with it. A payment already under way can still
        finish.
      </span>
      <XaButton
        size="sm"
        disabled={disabled}
        onClick={() =>
          void command({
            action: "revoke",
            agencyWorkspaceId,
            expectedActorId: snapshot!.currentActorId,
            slug,
            idempotencyKey: crypto.randomUUID(),
          })
        }
      >
        Stop the link
      </XaButton>
      <XaButton
        size="sm"
        variant="quiet"
        disabled={disabled}
        onClick={() => setRevoking(null)}
      >
        Keep it
      </XaButton>
    </span>
  );
  const agencyName =
    snapshot?.agency &&
    "name" in snapshot.agency &&
    typeof snapshot.agency.name === "string"
      ? snapshot.agency.name
      : "your agency";
  const openCount =
    snapshot?.connectedLinks.filter((link) => link.status === "open").length ??
    0;

  return (
    <div className={`${styles.column} ${styles.wide}`}>
      <div className={styles.brief}>
        <XaHeadline
          quiet={
            snapshot?.creation.reason === "ready"
              ? "Money goes to your own Stripe account. Strelva never holds it."
              : "Clients pay by card, straight into your own Stripe account."
          }
        >
          {snapshot?.connectedLinks.length
            ? `${snapshot.connectedLinks.length === 1 ? "1 payment link" : `${snapshot.connectedLinks.length} payment links`}, ${openCount} open.`
            : "Payment links"}
        </XaHeadline>
      </div>
      {error ? (
        <p className={styles.critical} role="alert">
          {error}
          {stale && snapshot
            ? " What you see may be out of date, so nothing can change until it's read again."
            : ""}{" "}
          <XaTextLink
            onClick={() => {
              if (!busy && !loading) void load();
            }}
          >
            Try again
          </XaTextLink>
        </p>
      ) : null}
      {message ? <XaSays>{message}</XaSays> : null}
      {pending ? (
        <p className={styles.body} role="status">
          Strelva is still checking that last change. Nothing else changes until
          it knows.{" "}
          <XaTextLink
            onClick={() => {
              if (!busy && !loading && !stale) void command(pending);
            }}
          >
            Check again
          </XaTextLink>
        </p>
      ) : null}

      {loading && !snapshot ? (
        <p className={styles.note} role="status">
          Reading payment links…
        </p>
      ) : !snapshot ? (
        <p className={styles.body}>
          Payment links couldn&apos;t be read. Only an owner or admin of the
          agency can make them.
        </p>
      ) : (
        <>
          {snapshot.creation.reason === "off" ? (
            <p className={styles.body}>
              New payment links open once your agency can connect its own Stripe
              account. Links you already made keep working.
            </p>
          ) : null}
          {snapshot.creation.reason === "setup_required" ? (
            <AgencyMerchantSetup
              agencyWorkspaceId={agencyWorkspaceId}
              onChange={() => void load()}
            />
          ) : null}
          {snapshot.creation.reason === "unavailable" ? (
            <p className={styles.body}>
              Strelva couldn&apos;t check Stripe just now, so no new link can be
              made. It checks again when you come back to this page.
            </p>
          ) : null}
          {snapshot.creation.reason === "ready" ? (
            <section
              className={styles.maker}
              aria-labelledby="new-link-heading"
            >
              <form onSubmit={submitCreate} className={styles.form} noValidate>
                <XaLabel as="h2" id="new-link-heading">
                  New payment link
                </XaLabel>
                <XaField
                  label="Client name"
                  value={form.clientName}
                  maxLength={160}
                  disabled={disabled}
                  error={fieldErrors.clientName}
                  onChange={(event) => {
                    setForm({ ...form, clientName: event.target.value });
                    setFieldErrors({ ...fieldErrors, clientName: undefined });
                  }}
                />
                <XaTextArea
                  label="What it is for"
                  value={form.description}
                  maxLength={1000}
                  disabled={disabled}
                  error={fieldErrors.description}
                  onChange={(event) => {
                    setForm({ ...form, description: event.target.value });
                    setFieldErrors({ ...fieldErrors, description: undefined });
                  }}
                />
                <XaSegmented
                  label="How much the client pays"
                  value={form.kind}
                  onChange={(kind) => {
                    if (!disabled) setForm({ ...form, kind });
                  }}
                  options={[
                    { value: "fixed", label: "A set amount" },
                    { value: "range", label: "Client picks within a range" },
                  ]}
                />
                {form.kind === "fixed" ? (
                  <XaField
                    label="Amount in dollars"
                    inputMode="decimal"
                    value={form.dollars}
                    disabled={disabled}
                    error={fieldErrors.amount}
                    onChange={(event) => {
                      setForm({ ...form, dollars: event.target.value });
                      setFieldErrors({ ...fieldErrors, amount: undefined });
                    }}
                  />
                ) : (
                  <div className={styles.pair}>
                    <XaField
                      label="Minimum in whole dollars"
                      inputMode="numeric"
                      value={form.minDollars}
                      disabled={disabled}
                      aria-invalid={fieldErrors.range ? true : undefined}
                      onChange={(event) => {
                        setForm({ ...form, minDollars: event.target.value });
                        setFieldErrors({ ...fieldErrors, range: undefined });
                      }}
                    />
                    <XaField
                      label="Maximum in whole dollars"
                      inputMode="numeric"
                      hint={
                        fieldErrors.range
                          ? undefined
                          : "The client picks in 50 dollar steps."
                      }
                      error={fieldErrors.range}
                      value={form.maxDollars}
                      disabled={disabled}
                      onChange={(event) => {
                        setForm({ ...form, maxDollars: event.target.value });
                        setFieldErrors({ ...fieldErrors, range: undefined });
                      }}
                    />
                  </div>
                )}
                <div className={styles.actions}>
                  <XaButton
                    type="submit"
                    variant="primary"
                    busy={busy && pending?.action === "create"}
                    disabled={disabled}
                  >
                    Make the link
                  </XaButton>
                </div>
                <p className={styles.note}>
                  Stripe&apos;s usual fees apply and Strelva adds none. You send
                  the link yourself.
                </p>
              </form>
              <div className={styles.preview}>
                <XaLabel>
                  What {form.clientName.trim() || "your client"} sees
                </XaLabel>
                {/* The client's page as they see it: the agency's name on top, no web address. */}
                <figure
                  className={styles.previewFrame}
                  aria-label={`The payment page ${form.clientName.trim() || "your client"} sees`}
                >
                  <p className={styles.previewBrand}>{agencyName}</p>
                  <p className={styles.previewTitle}>Pay {agencyName}</p>
                  <div className={styles.previewPay}>
                    <p className={styles.note}>
                      {form.clientName.trim() || "Client name"}
                    </p>
                    <p className={styles.body}>
                      {form.description.trim() ||
                        "What it is for appears here."}
                    </p>
                    {previewAmount(form) ? (
                      <>
                        <p className={styles.amount}>{previewAmount(form)}</p>
                        <span className={styles.previewPill} aria-hidden="true">
                          Pay{" "}
                          {form.kind === "fixed"
                            ? previewAmount(form)
                            : "the amount they choose"}
                        </span>
                      </>
                    ) : (
                      <p className={styles.previewPlaceholder}>
                        Amount appears here
                      </p>
                    )}
                  </div>
                </figure>
              </div>
            </section>
          ) : null}
          {snapshot.connectedLinks.length ? (
            <section className={styles.section} aria-labelledby="links-heading">
              <XaLabel as="h2" id="links-heading">
                Payment links
              </XaLabel>
              <XaRows label="Agency payment links">
                {snapshot.connectedLinks.map((link) => (
                  <XaRow
                    key={link.id}
                    title={link.clientName}
                    meta={
                      <span className={styles.figure}>
                        {connectedPrice(link)}
                      </span>
                    }
                    wrapOnPhone
                    detail={
                      <>
                        {/* The invoice number lives on the invoice itself, not in the list. */}
                        <span>{link.description}</span>
                        <br />
                        {link.status === "paid" ? (
                          <XaStatus kind="live" size="sm">
                            Paid {exact(link.paidAmountCents ?? 0)} ·{" "}
                            {day(link.paidAt)}
                          </XaStatus>
                        ) : link.status === "expired" ? (
                          <XaStatus kind="draft" size="sm">
                            Stopped {day(link.revokedAt)}
                          </XaStatus>
                        ) : (
                          <XaStatus kind="waits" size="sm">
                            Waiting on {link.clientName}
                          </XaStatus>
                        )}
                        <span className={styles.links}>
                          {link.status === "open" ? (
                            <>
                              <XaTextLink
                                onClick={() => {
                                  if (!disabled) void copy(link.slug);
                                }}
                              >
                                Copy link
                              </XaTextLink>
                              <span aria-hidden="true">·</span>
                              <XaTextLink href={`/pay/${link.slug}`}>
                                Open it
                              </XaTextLink>
                              <span aria-hidden="true">·</span>
                            </>
                          ) : null}
                          <XaTextLink
                            href={`/workspace/payment-links/${link.id}/invoice?workspaceId=${encodeURIComponent(agencyWorkspaceId)}`}
                          >
                            Invoice
                          </XaTextLink>
                          {link.status === "paid" ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <XaTextLink
                                href={`/workspace/payment-links/${link.id}/receipt?workspaceId=${encodeURIComponent(agencyWorkspaceId)}`}
                              >
                                Receipt
                              </XaTextLink>
                            </>
                          ) : null}
                          {link.status === "open" && revoking !== link.slug ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <XaTextLink
                                onClick={() => {
                                  if (!disabled) setRevoking(link.slug);
                                }}
                              >
                                Stop link
                              </XaTextLink>
                            </>
                          ) : null}
                        </span>
                        {link.status === "open" && revoking === link.slug
                          ? expireConfirm(link.slug)
                          : null}
                      </>
                    }
                  />
                ))}
              </XaRows>
            </section>
          ) : snapshot.creation.reason === "ready" &&
            !snapshot.legacyMerchant ? (
            <p className={styles.body}>
              No links yet. The first one you make shows up here, with its
              invoice.
            </p>
          ) : null}
          {snapshot.legacyMerchant ? (
            <section
              className={styles.section}
              aria-labelledby="earlier-heading"
            >
              <XaLabel as="h2" id="earlier-heading">
                {snapshot.connectedLinks.length
                  ? "Earlier payment links"
                  : "Payment links"}
              </XaLabel>
              <p className={styles.note}>
                One-time links from before agencies had their own Stripe
                account. Each is paid once; none repeats.
              </p>
              {!snapshot.paymentStatusAvailable ? (
                <p className={styles.body}>
                  Strelva couldn&apos;t check which were paid. It checks again
                  when you come back to this page.
                </p>
              ) : null}
              {!snapshot.payLinks.length ? (
                <p className={styles.body}>No earlier links.</p>
              ) : (
                <XaRows label="Earlier payment links">
                  {snapshot.payLinks.map((link) => {
                    const paid = snapshot.paidPayments[link.slug];
                    return (
                      <XaRow
                        key={link.slug}
                        title={link.clientName}
                        meta={
                          <span className={styles.figure}>{price(link)}</span>
                        }
                        wrapOnPhone
                        detail={
                          <>
                            <span>
                              {link.customCopy ? `${link.customCopy} · ` : ""}
                              {link.agencyWorkspaceId
                                ? `${link.agencyDisplayName || "Your agency"} · Runs on Strelva`
                                : "Made by Strelva"}{" "}
                              · {day(link.createdAt)}
                            </span>
                            <br />
                            {link.revokedAt ? (
                              <>
                                <XaStatus kind="draft" size="sm">
                                  Stopped {day(link.revokedAt)}
                                </XaStatus>
                                {paid ? (
                                  <> · Paid {money(paid.amountCents)}</>
                                ) : !snapshot.paymentStatusAvailable ? (
                                  <> · Couldn&apos;t check payment</>
                                ) : null}
                              </>
                            ) : paid ? (
                              <XaStatus kind="live" size="sm">
                                Paid {money(paid.amountCents)} ·{" "}
                                {day(paid.paidAt)}
                              </XaStatus>
                            ) : (
                              <span>
                                {snapshot.paymentStatusAvailable
                                  ? "No payment found yet"
                                  : "Couldn't check payment"}
                              </span>
                            )}
                            {!link.revokedAt ? (
                              <span className={styles.links}>
                                <XaTextLink
                                  onClick={() => {
                                    if (!disabled) void copy(link.slug);
                                  }}
                                >
                                  Copy link
                                </XaTextLink>
                                <span aria-hidden="true">·</span>
                                <XaTextLink href={`/pay/${link.slug}`}>
                                  Open it
                                </XaTextLink>
                                {revoking !== link.slug ? (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <XaTextLink
                                      onClick={() => {
                                        if (!disabled) setRevoking(link.slug);
                                      }}
                                    >
                                      Stop link
                                    </XaTextLink>
                                  </>
                                ) : null}
                              </span>
                            ) : null}
                            {!link.revokedAt && revoking === link.slug
                              ? expireConfirm(link.slug)
                              : null}
                          </>
                        }
                      />
                    );
                  })}
                </XaRows>
              )}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
