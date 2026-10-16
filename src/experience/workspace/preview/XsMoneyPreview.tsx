"use client";
/**
 * The money lane (xs-money) in place: every real money component inside the
 * real StrelvaShell, fed by fixtures through the components' own `request`
 * and `transport` seams. Nothing reaches Stripe, a server or an inbox.
 * /preview/strelva/xa/xs-money/<screen>?state=…&mode=dark
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import type { StrelvaClientLink } from "@/experience/app-frame/workspace-places";
import { XaHeadline, XaTextLink } from "@/components/ui/strelva/Xa";
import { BusinessBillingView } from "@/experience/workspace/billing/BusinessBillingView";
import {
  BusinessAiBudgetSummary,
  StartWorkspacePlan,
} from "@/experience/workspace/billing/StartWorkspacePlan";
import { WorkspacePayerTransition } from "@/experience/workspace/WorkspacePayerTransition";
import { AgencyInvoiceAcceptance } from "@/experience/workspace/billing/AgencyInvoiceControls";
import { UNRELEASED_CHECKOUT } from "@/experience/workspace/billing/AgencyCheckoutStatus";
import { AgencyBillingView } from "@/experience/workspace/billing/AgencyBillingView";
import {
  AgencyPayerRequestLines,
  AgencyPayerRequests,
} from "@/experience/workspace/billing/AgencyPayerRequests";
import { AgencyBillingPebble } from "@/experience/workspace/billing/AgencyBillingPebble";
import { AgencyPaymentLinks } from "@/experience/workspace/billing/AgencyPaymentLinks";
import { MoneyDocument } from "@/experience/workspace/billing/MoneyDocument";
import { AccountPayerInbox } from "@/experience/workspace/AccountPayerInbox";
import { MoneyLoadFailure } from "@/experience/workspace/money/MoneyLoadFailure";
import { MoneyLoading } from "@/experience/workspace/money/MoneyLoading";
import { PublicMoneyPage } from "@/experience/workspace/money/PublicMoneyPage";
import { SourceAttributionView } from "@/experience/workspace/money/SourceAttributionView";
import { CollectionTerms } from "@/experience/workspace/money/CollectionTerms";
import { VersionTerms } from "@/experience/workspace/money/VersionTerms";
import { SourceListing } from "@/experience/workspace/money/SourceListing";
import styles from "@/experience/workspace/money/money.module.css";
import { PaymentsScreen } from "@/app/workspace/payments/PaymentsScreen";
import { ConnectedPayLink } from "@/app/pay/[slug]/ConnectedPayLink";
import BusinessPayment from "@/app/pay/business/BusinessPayment";
import CreatorMaintenance from "@/app/workspace/creator-maintenance/CreatorMaintenance";
import ReviewQueue from "@/app/workspace/money-reconciliation/ReviewQueue";
import { businessDepositFixture } from "./deposit-fixture";
import {
  CLIENT_COLORS,
  NORTH_BRAND,
  XS,
  agencyBilling,
  agencyInbox,
  businessMoney,
  connectedLinks,
  creatorMaintenance,
  creatorSources,
  governedGraph,
  harborBilling,
  harborBillingAgencyPays,
  harborBudget,
  harborRetail,
  invoiceDoc,
  payerSnapshot,
  paymentLinksSnapshot,
  paymentRequests,
  paymentSources,
  receiptDoc,
  reconciliationIssues,
  versionGraph,
} from "./xs-money-fixture";
import { XS_MONEY_SCREENS, type XsMoneyScreen } from "./xs-money-screens";
export { XS_MONEY_SCREENS, type XsMoneyScreen };

const BASE = "/preview/strelva/xa/xs-money";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const never = () => new Promise<Response>(() => undefined);

/** A fetch that answers from fixtures. `hang` keeps the loading state on screen; `fail` answers 503. */
function fixtureFetch(
  answer: (url: string, init?: RequestInit) => unknown,
  mode: "ok" | "hang" | "fail" = "ok",
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (mode === "hang") return never();
    if (mode === "fail")
      return json(
        { error: "Strelva could not read this just now. Nothing changed." },
        503,
      );
    await new Promise((resolve) =>
      setTimeout(resolve, init?.method === "POST" ? 700 : 120),
    );
    return json(answer(String(input), init));
  }) as typeof fetch;
}

/**
 * The email route refuses to be framed (frame-ancestors 'none'), so the
 * preview reads its HTML and shows it through srcDoc: same bytes, no framing
 * of the app itself.
 */
function EmailFrame({
  src,
  title,
  style,
}: {
  src: string;
  title: string;
  style: React.CSSProperties;
}) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void fetch(src)
      .then((response) => response.text())
      .then((text) => {
        if (live) setHtml(text);
      })
      .catch(() => {
        if (live) setHtml("<p>The email template could not be read.</p>");
      });
    return () => {
      live = false;
    };
  }, [src]);
  return html === null ? (
    <p className={styles.note} role="status">
      Reading the email template…
    </p>
  ) : (
    <iframe title={title} srcDoc={html} sandbox="" style={style} />
  );
}

export function XsMoneyPreview({
  screen,
  state,
  mode,
}: {
  screen: XsMoneyScreen;
  state: string;
  mode: "light" | "dark";
}) {
  const states = XS_MONEY_SCREENS[screen] as readonly string[];
  const shell = {
    appBase: "/preview/strelva",
    signOut: null,
    systemsReleased: true,
    mode,
    notice: (
      <p className={styles.note} style={{ padding: "8px 20px" }}>
        Fictional preview. Nothing here reaches Stripe, a client or an inbox.
        {screen === "billing-agency" && state === "priced"
          ? " Wholesale figures are fixture placeholders, not ADR 0017 prices."
          : ""}
      </p>
    ),
  } as const;
  const clients: StrelvaClientLink[] = [
    {
      id: "harbor",
      name: "Harbor Dental",
      href: `${BASE}/billing`,
      detail: "Dr. Lin",
      color: CLIENT_COLORS.harbor,
      waits: screen === "billing-agency",
    },
    {
      id: "coast",
      name: "North Coast Realty",
      href: `${BASE}/billing-agency`,
      detail: "Dana",
      color: CLIENT_COLORS.coast,
    },
    {
      id: "lakeview",
      name: "Lakeview Mediation",
      href: `${BASE}/billing-agency`,
      detail: "Ruth",
      color: CLIENT_COLORS.lakeview,
    },
    {
      id: "fieldwork",
      name: "Fieldwork Studio",
      href: `${BASE}/billing-agency`,
      detail: "Ana",
      color: CLIENT_COLORS.fieldwork,
    },
  ];
  const owner = (
    children: ReactNode,
    detailsPlace: "plan" | undefined = "plan",
  ) => (
    <StrelvaShell
      {...shell}
      workspaceId={XS.harbor}
      workspaceName="Harbor Dental"
      accountName="Dr. Amy Lin"
      active="settings"
      detailsPlace={detailsPlace}
      agency={{
        name: "North Studio",
        person: "Maya",
        color: CLIENT_COLORS.harbor,
      }}
    >
      {children}
    </StrelvaShell>
  );
  const agency = (children: ReactNode, paymentLinks = false) => (
    <StrelvaShell
      {...shell}
      workspaceId={XS.north}
      workspaceName="North Studio"
      accountName="Maya Okafor"
      ownerBrand={NORTH_BRAND}
      detailsPlace={paymentLinks ? undefined : "plan"}
      agencyNavigation={{
        paymentLinksCurrent: paymentLinks,
        leadsAvailable: false,
        clients,
        queueCount: 3,
      }}
    >
      {children}
    </StrelvaShell>
  );
  const loading = (label: string) => <MoneyLoading label={label} />;
  const failure = (title: string, quiet: string) => (
    <div className={styles.screen}>
      <MoneyLoadFailure
        title={title}
        quiet={quiet}
        retryHref={`${BASE}/${screen}`}
      />
    </div>
  );

  const requests = useMemo(
    () => ({
      payer: fixtureFetch(
        (url, init) =>
          init?.method === "POST"
            ? payerSnapshot("pending")
            : payerSnapshot(
                state === "done"
                  ? "accepted"
                  : state === "empty"
                    ? "none"
                    : "pending",
              ),
        state === "error" ? "fail" : "ok",
      ),
      agencyInbox: fixtureFetch(
        () => ({ transitions: agencyInbox.transitions }),
        "ok",
      ),
      accountInbox: fixtureFetch(
        () =>
          state === "empty"
            ? {
                transitions: [],
                jobs: [],
                current: null,
                pending: null,
                currentActorId: XS.maya,
              }
            : state === "done"
              ? {
                  ...agencyInbox,
                  transitions: [
                    { ...agencyInbox.transitions[0]!, status: "accepted" },
                  ],
                  jobs: [],
                }
              : agencyInbox,
        state === "error" ? "fail" : "ok",
      ),
      invoice: fixtureFetch((url, init) =>
        init?.method === "POST"
          ? {
              ...harborRetail,
              status:
                JSON.parse(String(init.body)).action === "accept"
                  ? "accepted"
                  : "declined",
              can_accept: false,
            }
          : harborRetail,
      ),
      links: fixtureFetch(
        (url, init) => {
          if (init?.method === "POST") {
            const body = JSON.parse(String(init.body));
            return {
              payLink: {
                slug: body.slug ?? "new-client-z4k2p",
                clientName: body.clientName,
                createdAt: new Date().toISOString(),
                revokedAt:
                  body.action === "revoke"
                    ? new Date().toISOString()
                    : undefined,
                revokedBy: XS.maya,
                agencyWorkspaceId: XS.north,
              },
            };
          }
          return state === "setup"
            ? paymentLinksSnapshot("setup_required", [])
            : state === "off"
              ? paymentLinksSnapshot("off", [])
              : paymentLinksSnapshot(
                  "ready",
                  state === "empty" ? [] : connectedLinks,
                );
        },
        state === "loading" ? "hang" : state === "error" ? "fail" : "ok",
      ),
      portal: (async () =>
        json(
          {
            error:
              "Payment management opens on Stripe in the real workspace. Nothing changed here.",
          },
          409,
        )) as (input: string, init?: RequestInit) => Promise<Response>,
      money: fixtureFetch(() => ({ error: "Fictional preview" }), "fail"),
    }),
    [state],
  );

  if (!states.includes(state)) return null;

  switch (screen) {
    case "billing": {
      if (state === "loading")
        return owner(loading("Reading the plan and who pays"));
      if (state === "error")
        return owner(
          failure(
            "Billing could not be loaded.",
            "Your sites and inquiries keep running. Confirm your access and try again.",
          ),
        );
      const billing =
        state === "empty"
          ? null
          : state === "past-due"
            ? { ...harborBillingAgencyPays, paymentStatus: "past_due" }
            : harborBilling;
      return owner(
        <div className={styles.screen}>
          <div className={state === "waiting" ? styles.split : styles.column}>
            <div className={styles.column}>
              <BusinessBillingView
                workspaceId={XS.harbor}
                canManage
                billing={billing}
                businessName="Harbor Dental"
                backHref={`${BASE}/billing`}
                transport={requests.portal}
                navigate={() => undefined}
              />
              {state === "empty" ? (
                <StartWorkspacePlan
                  workspaceId={XS.harbor}
                  budget={harborBudget}
                  capUsd={25}
                  budgetEnforced
                  transport={requests.portal}
                  navigate={() => undefined}
                />
              ) : (
                <BusinessAiBudgetSummary
                  budget={harborBudget}
                  capUsd={25}
                  enforced
                />
              )}
              <WorkspacePayerTransition
                workspaceId={XS.harbor}
                canPropose
                agencyChoices={[{ id: XS.north, name: "North Studio" }]}
                request={requests.payer}
              />
              <nav
                aria-label="Payment and agency settings"
                className={styles.links}
              >
                <XaTextLink href={`${BASE}/payments`}>
                  Deposits and payments
                </XaTextLink>
                <span aria-hidden="true">·</span>
                <XaTextLink href={`${BASE}/money-terms`}>
                  Recorded money terms
                </XaTextLink>
              </nav>
            </div>
            {state === "waiting" ? (
              <aside
                className={styles.side}
                aria-label="A price from your agency"
              >
                <AgencyInvoiceAcceptance
                  invoiceId={harborRetail.id}
                  checkoutAvailability={UNRELEASED_CHECKOUT}
                  request={requests.invoice}
                  agencyNames={{ [XS.north]: "North Studio" }}
                  planCents={harborBilling.monthlyCents}
                />
              </aside>
            ) : null}
          </div>
        </div>,
      );
    }
    case "billing-agency": {
      if (state === "loading")
        return agency(loading("Reading what your agency pays"));
      if (state === "error")
        return agency(
          failure(
            "Agency billing did not load.",
            "Only an agency owner or admin can read its billing.",
          ),
        );
      const colors = {
        [XS.harbor]: CLIENT_COLORS.harbor,
        [XS.coast]: CLIENT_COLORS.coast,
        [XS.lakeview]: CLIENT_COLORS.lakeview,
        [XS.fieldwork]: CLIENT_COLORS.fieldwork,
      };
      const billingRecord = agencyBilling(state === "priced");
      return agency(
        <AgencyPayerRequests
          agencyWorkspaceId={XS.north}
          agencyName="North Studio"
          request={
            state === "empty"
              ? fixtureFetch(() => ({ transitions: [] }))
              : requests.agencyInbox
          }
        >
          <div className={styles.screen}>
            <div className={styles.split} data-phone="main-first">
              <div className={styles.column}>
                {state === "empty" ? (
                  <section className={styles.section}>
                    <XaHeadline quiet="No client has North Studio as payer yet.">
                      Agency billing
                    </XaHeadline>
                    <ul
                      className={styles.clientList}
                      aria-label="Owners asking your agency to pay"
                    >
                      <AgencyPayerRequestLines listed={[]} colors={colors} />
                    </ul>
                  </section>
                ) : (
                  <AgencyBillingView
                    billing={billingRecord}
                    checkoutAvailability={UNRELEASED_CHECKOUT}
                    clientColors={colors}
                  />
                )}
                <nav
                  aria-label="More about agency money"
                  className={styles.links}
                >
                  <XaTextLink href={`${BASE}/payment-links`}>
                    Payment links
                  </XaTextLink>
                  <span aria-hidden="true">·</span>
                  <XaTextLink href={`${BASE}/creator-maintenance`}>
                    Creator maintenance
                  </XaTextLink>
                </nav>
              </div>
              {state === "empty" ? null : (
                <aside
                  className={styles.side}
                  aria-label="What Pebble is waiting on"
                >
                  <AgencyBillingPebble billing={billingRecord} />
                </aside>
              )}
            </div>
          </div>
        </AgencyPayerRequests>,
      );
    }
    case "payment-links":
      return agency(
        <div className={styles.screen}>
          <AgencyPaymentLinks
            key={state}
            agencyWorkspaceId={XS.north}
            request={requests.links}
          />
        </div>,
        true,
      );
    case "invoice":
      return agency(
        state === "loading" ? (
          loading("Reading the invoice")
        ) : (
          <div className={styles.screen}>
            <MoneyDocument
              doc={invoiceDoc}
              back={{ label: "Payment links", href: `${BASE}/payment-links` }}
              payUrl="https://strelva.com/pay/harbor-dental-k3x9q"
            />
          </div>
        ),
        true,
      );
    case "receipt":
      return agency(
        <div className={styles.screen}>
          {state === "waiting" ? (
            <div className={styles.docFrame}>
              <p className={styles.note}>
                <XaTextLink href={`${BASE}/payment-links`}>
                  Payment links
                </XaTextLink>
              </p>
              <XaHeadline quiet="Stripe confirms payments; this page fills in when it does.">
                No payment is recorded for this link yet.
              </XaHeadline>
              <p className={styles.body}>
                Harbor Dental has not paid this link. The invoice stays open
                until they do or you expire it.{" "}
                <XaTextLink href={`${BASE}/invoice`}>
                  See the invoice
                </XaTextLink>
              </p>
            </div>
          ) : (
            <MoneyDocument
              doc={receiptDoc}
              back={{ label: "Payment links", href: `${BASE}/payment-links` }}
            />
          )}
        </div>,
        true,
      );
    case "payments":
      if (state === "loading")
        return owner(loading("Reading deposits and payments"));
      if (state === "error")
        return owner(
          failure(
            "Payments did not load.",
            "Payments already made are safe in Stripe. Confirm your access and try again.",
          ),
        );
      return owner(
        <PaymentsScreen
          workspaceId={XS.harbor}
          money={
            state === "empty"
              ? { account: { state: "ready" }, payments: [], events: [] }
              : state === "setup"
                ? { account: { state: "restricted" }, payments: [], events: [] }
                : businessMoney
          }
          sources={state === "empty" ? [] : paymentSources}
          requests={
            state === "empty" || state === "setup" ? [] : paymentRequests
          }
        />,
      );
    case "pay": {
      const base = {
        slug: "harbor-dental-k3x9q",
        clientName: "Harbor Dental",
        description:
          "Website care for November: booking page, hours and two inquiry follow-ups",
        amountCents: 125050 as number | null,
        minCents: null as number | null,
        maxCents: null as number | null,
        currency: "usd",
        status: "open" as "open" | "paid" | "expired",
        receiptNumber: null as number | null,
      };
      const view =
        state === "range"
          ? {
              ...base,
              description: "Spanish intake form. Choose what fits this month.",
              amountCents: null,
              minCents: 20000,
              maxCents: 40000,
            }
          : state === "paid"
            ? { ...base, status: "paid" as const, receiptNumber: 3 }
            : state === "expired"
              ? { ...base, status: "expired" as const }
              : base;
      return (
        <ConnectedPayLink
          link={view}
          brand={NORTH_BRAND}
          payment={
            state === "returned"
              ? "success"
              : state === "cancelled"
                ? "cancelled"
                : undefined
          }
        />
      );
    }
    case "pay-receipt":
      return state === "waiting" ? (
        <PublicMoneyPage
          brand={NORTH_BRAND}
          lead={
            <>
              <p className={styles.publicKicker}>Payment receipt</p>
              <h1 className={styles.publicTitle}>
                No payment is recorded for this link yet.
              </h1>
              <p className={styles.publicCopy}>
                Stripe tells North Studio when a payment goes through. If you
                just paid, refresh in a minute; the receipt appears here once
                Stripe confirms it.
              </p>
              <p className={styles.note}>
                <XaTextLink href={`${BASE}/pay`}>
                  Back to the payment link
                </XaTextLink>
              </p>
            </>
          }
        />
      ) : (
        <PublicMoneyPage
          brand={NORTH_BRAND}
          single
          lead={
            <MoneyDocument
              doc={{
                ...receiptDoc,
                number: 4,
                snapshot: {
                  ...receiptDoc.snapshot,
                  billTo: "Harbor Dental",
                  description: invoiceDoc.snapshot.description,
                  amountPaidCents: 125050,
                },
              }}
              back={{ label: "Back to the payment link", href: `${BASE}/pay` }}
            />
          }
        />
      );
    case "pay-business":
      return state === "error" ? (
        <BusinessPayment key="error" token={"0".repeat(64)} preview={false} />
      ) : (
        <BusinessPayment
          key={state}
          token={"0".repeat(64)}
          preview
          initialRequest={
            state === "paid"
              ? {
                  ...businessDepositFixture,
                  businessName: "Harbor Dental",
                  paid: true,
                  status: "paid",
                }
              : {
                  ...businessDepositFixture,
                  businessName: "Harbor Dental",
                  acceptedTerms:
                    "Deposit for Ana R.'s cleaning on Mon Nov 23 at 10:30, at 1180 Elmwood Ave.",
                }
          }
        />
      );
    case "money-terms":
      return owner(
        state === "error" ? (
          failure(
            "Terms could not be loaded.",
            "Confirm your current business access and reload.",
          )
        ) : (
          <div className={styles.screen}>
            <p className={styles.note}>
              <XaTextLink href={`${BASE}/billing`}>Plan and billing</XaTextLink>
            </p>
            <XaHeadline quiet="Written prices you accepted, and the exact period each covers. Nothing here charges a card.">
              Recorded money terms
            </XaHeadline>
            <CollectionTerms
              graph={governedGraph(state === "empty")}
              actorId={XS.amy}
              request={requests.money}
            />
            <VersionTerms
              graph={versionGraph(state === "empty")}
              actorId={XS.amy}
              request={requests.money}
            />
          </div>
        ),
      );
    case "reconciliation":
      return (
        <StrelvaShell
          {...shell}
          workspaceName="Strelva"
          accountName="Priya Shah"
          agencyNavigation={{ active: "library", leadsAvailable: false }}
        >
          {state === "error" ? (
            failure(
              "Payment exceptions could not be loaded.",
              "Only Strelva staff can read them. Confirm your access and try again.",
            )
          ) : (
            <div className={styles.screen}>
              <XaHeadline quiet="Check each against Stripe and the ledger, then record what you found. Recording never moves money.">
                {state === "done"
                  ? "No payment exception waits for review."
                  : "1 payment exception waits for review."}
              </XaHeadline>
              <ReviewQueue
                issues={state === "done" ? [] : reconciliationIssues}
                actorId={XS.priya}
                names={{ [XS.priya]: "Priya" }}
              />
            </div>
          )}
        </StrelvaShell>
      );
    case "creator-maintenance":
      return agency(
        state === "error" ? (
          failure(
            "Maintenance records could not be loaded.",
            "Confirm owner or admin access and try again.",
          )
        ) : (
          <div className={styles.screen}>
            <nav aria-label="Back" className={styles.links}>
              <XaTextLink href={`${BASE}/billing-agency`}>Billing</XaTextLink>
            </nav>
            <XaHeadline quiet="Who keeps each System you list working, and what its creator earns.">
              Creator maintenance
            </XaHeadline>
            <SourceListing
              graph={creatorSources(state === "empty")}
              actorId={XS.maya}
              request={requests.money}
            />
            <CreatorMaintenance
              graph={creatorMaintenance(state === "empty")}
              listingNames={Object.fromEntries(
                creatorSources(state === "empty").sources.map((item) => [
                  item.sourceRevisionId,
                  `${item.name}, Release ${item.revision}`,
                ]),
              )}
            />
          </div>
        ),
      );
    case "source-attribution":
      return state === "creator"
        ? agency(
            <SourceAttributionView
              workspaceId={XS.north}
              systemId={XS.system}
              creator={{
                creatorName: "North Studio",
                creatorWorkspaceId: XS.north,
              }}
            />,
          )
        : owner(
            state === "error" ? (
              failure(
                "Who made this could not be checked.",
                "The System keeps running. Its creator credit is read again next time you open this.",
              )
            ) : (
              <SourceAttributionView
                workspaceId={XS.harbor}
                systemId={XS.system}
                creator={{
                  creatorName: "North Studio",
                  creatorWorkspaceId: XS.north,
                }}
              />
            ),
            undefined,
          );
    case "payer":
      return agency(
        <div className={styles.screen}>
          <XaHeadline quiet="Money addressed to you, Maya, across every business.">
            Payer requests
          </XaHeadline>
          <AccountPayerInbox request={requests.accountInbox} />
        </div>,
      );
    case "email-declined":
      return (
        <main data-workspace-theme="linen" data-workspace-mode={mode}>
          <div className={styles.screen}>
            <XaHeadline quiet="A template only. Client emails stay off during the rollout.">
              Card declined email
            </XaHeadline>
            <EmailFrame
              title="Card declined email"
              src="/preview/strelva/email/html?template=declined"
              style={{
                width: "100%",
                maxWidth: 760,
                height: 760,
                border: "1px solid var(--st-line)",
                borderRadius: 16,
                background: "#fff",
              }}
            />
          </div>
        </main>
      );
  }
}
