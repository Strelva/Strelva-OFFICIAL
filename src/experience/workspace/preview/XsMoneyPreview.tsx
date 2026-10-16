"use client";
/**
 * The money lane (xs-money) in place: every real money component inside the
 * real StrelvaShell, fed by fixtures through the components' own `request`
 * and `transport` seams. Nothing reaches Stripe, a server or an inbox.
 * /preview/strelva/xa/xs-money/<screen>?state=…&mode=dark
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { OperatorFrame } from "@/experience/operations/OperatorFrame";
import type { StrelvaClientLink } from "@/experience/app-frame/workspace-places";
import { XaHeadline, XaTextLink } from "@/components/ui/strelva/Xa";
import { BusinessBillingView } from "@/experience/workspace/billing/BusinessBillingView";
import {
  BusinessAiBudgetSummary,
  WorkspacePlanUnavailable,
} from "@/experience/workspace/billing/StartWorkspacePlan";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { AskStrelva } from "@/experience/ask/AskStrelva";
import { GettingStarted } from "@/experience/getting-started/GettingStarted";
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
import { MoneyYesTurns } from "@/experience/workspace/money/OfferRows";
import { SourceListing } from "@/experience/workspace/money/SourceListing";
import styles from "@/experience/workspace/money/money.module.css";
import { PaymentsScreen } from "@/app/workspace/payments/PaymentsScreen";
import { ConnectedPayLink } from "@/app/pay/[slug]/ConnectedPayLink";
import { PaidNote } from "@/app/pay/[slug]/PaidNote";
import BusinessPayment from "@/app/pay/business/BusinessPayment";
import { harborBrand } from "./xs-visitor-fixture";
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
import { XA_HARBOR, XA_NORTH } from "./xa-day";
export { XS_MONEY_SCREENS, type XsMoneyScreen };

const BASE = "/preview/strelva/xa/xs-money";
const XA_OWNER_EMAIL = "amy@harbordental.com";
const PAUSED_TEXT =
  "Strelva can't take on new work for this business until plans open. Nothing changed. Put this business on the list for plans, or bring in an agency now.";
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
      </p>
    ),
  } as const;
  const clients: StrelvaClientLink[] = [
    {
      id: "harbor",
      name: XA_HARBOR.name,
      href: `${BASE}/billing`,
      detail: XA_HARBOR.ownerShort,
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
  // "plan" highlights Plan and usage; "elsewhere" opens Business details with
  // nothing current (a money page that isn't Plan and usage); "main" is the
  // business's own rail (Ask, a System's page).
  const owner = (
    children: ReactNode,
    place: "plan" | "elsewhere" | "main" = "plan",
  ) => (
    <StrelvaShell
      {...shell}
      workspaceId={XS.harbor}
      workspaceName={XA_HARBOR.name}
      accountName={XA_HARBOR.owner}
      active={place === "main" ? "home" : "settings"}
      detailsPlace={place === "main" ? undefined : place}
      agency={{
        name: XA_NORTH.name,
        person: XA_NORTH.first,
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
      workspaceName={XA_NORTH.name}
      accountName={XA_NORTH.person}
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
      // One payer per screen: past due is North Studio's card, so who pays
      // reads North Studio's agreed change, not a pending ask.
      payer: fixtureFetch(
        (url, init) =>
          init?.method === "POST"
            ? payerSnapshot("pending")
            : payerSnapshot(
                state === "done" || state === "past-due"
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
      payerNone: fixtureFetch(() => payerSnapshot("none")),
      waitlist: fixtureFetch((url, init) => {
        if (init?.method !== "POST") return {};
        const body = JSON.parse(String(init.body ?? "{}"));
        return body.action === "leave"
          ? { joined: false }
          : { joined: true, email: XA_OWNER_EMAIL };
      }),
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
            "Plan and usage couldn't be read just now.",
            "Your website and inquiries keep running. Try again in a moment.",
          ),
        );
      // A new business while plans are closed: the honest waitlist, not a wall.
      if (state === "new" || state === "new-joined")
        return owner(
          <WorkspaceRequestContext.Provider value={requests.waitlist}>
            <div className={styles.screen}>
              <div className={styles.column}>
                <WorkspacePlanUnavailable
                  workspaceId={XS.harbor}
                  businessName={XA_HARBOR.name}
                  joinedEmail={state === "new-joined" ? XA_OWNER_EMAIL : null}
                  noIncludedWork
                  agencyHref={`${BASE}/billing`}
                />
                <WorkspacePayerTransition
                  workspaceId={XS.harbor}
                  canPropose
                  agencyChoices={[]}
                  request={requests.payerNone}
                />
              </div>
            </div>
          </WorkspaceRequestContext.Provider>,
        );
      const billing =
        state === "not-set-up"
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
                businessName={XA_HARBOR.name}
                backHref={`${BASE}/billing`}
                transport={requests.portal}
                navigate={() => undefined}
              />
              {billing ? (
                <BusinessAiBudgetSummary
                  budget={harborBudget}
                  capUsd={25}
                  enforced
                />
              ) : null}
              <WorkspacePayerTransition
                workspaceId={XS.harbor}
                canPropose
                agencyChoices={[{ id: XS.north, name: XA_NORTH.name }]}
                billedTo={billing?.payerParty ?? null}
                request={requests.payer}
              />
              <nav aria-label="More about money" className={styles.links}>
                <XaTextLink href={`${BASE}/payments`}>
                  Payments from your customers
                </XaTextLink>
                <span aria-hidden="true">·</span>
                <XaTextLink href={`${BASE}/money-terms`}>
                  Prices you&rsquo;ve agreed to
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
                  agencyNames={{ [XS.north]: XA_NORTH.name }}
                />
              </aside>
            ) : null}
          </div>
        </div>,
      );
    }
    case "ask-paused":
      return owner(
        <WorkspaceRequestContext.Provider value={requests.waitlist}>
          <AskStrelva
            key={state}
            workspaceId={XS.harbor}
            businessName={XA_HARBOR.name}
            decider={{ name: "you", you: true }}
            request={requests.waitlist}
            initialMessages={[
              {
                id: "paused-1",
                role: "user",
                content: "Add our Thanksgiving hours to the website",
                result: null,
              },
              {
                id: "paused-2",
                role: "assistant",
                content: PAUSED_TEXT,
                result: {
                  kind: "refusal",
                  items: [
                    {
                      kind: "refusal",
                      toolId: "classifier",
                      status: "refused",
                      ids: [],
                      summary: "budget_paused",
                    },
                  ],
                  systemId: null,
                  conversationId: "c-paused",
                  saved: true,
                  budgetRecovery: "waitlist",
                },
              },
            ]}
          />
        </WorkspaceRequestContext.Provider>,
        "main",
      );
    case "getting-started-plans":
      return (
        <div data-workspace-theme="linen" data-workspace-mode={mode}>
          <WorkspaceRequestContext.Provider value={requests.waitlist}>
            <GettingStarted
              account={XA_HARBOR.owner}
              mode={mode}
              start={{ phase: "next", saved: { added: 4, later: 1 } }}
              business={{
                workspaceId: XS.harbor,
                name: XA_HARBOR.name,
                website: `https://${XA_HARBOR.domain}/`,
                canConfirm: true,
                revision: 3,
                waiting: [],
              }}
              plans={{ joinedEmail: null }}
              links={{
                home: `${BASE}/ask-paused`,
                details: `${BASE}/billing`,
                agency: `${BASE}/billing`,
                google: null,
                connect: `${BASE}/billing`,
                check: null,
                request: null,
                ask: null,
              }}
            />
          </WorkspaceRequestContext.Provider>
        </div>
      );
    case "billing-agency": {
      if (state === "loading")
        return agency(loading("Reading what your agency pays"));
      if (state === "error")
        return agency(
          failure(
            "Your agency's billing couldn't be read just now.",
            "Only an owner or admin of the agency can open it.",
          ),
        );
      const billingRecord = agencyBilling(false);
      return agency(
        <AgencyPayerRequests
          agencyWorkspaceId={XS.north}
          agencyName={XA_NORTH.name}
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
                    <XaHeadline quiet="When an owner asks, it waits here for your answer.">
                      No client has asked North Studio to cover Strelva yet.
                    </XaHeadline>
                    <ul
                      className={styles.clientList}
                      aria-label="Owners asking your agency to pay"
                    >
                      <AgencyPayerRequestLines listed={[]} />
                    </ul>
                  </section>
                ) : (
                  <AgencyBillingView
                    billing={billingRecord}
                    checkoutAvailability={UNRELEASED_CHECKOUT}
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
                    Apps you made for others
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
              <XaHeadline quiet="It fills in here once Stripe confirms one.">
                No payment is recorded for this link yet.
              </XaHeadline>
              <p className={styles.body}>
                Harbor Dental hasn&apos;t paid yet. The invoice stays open
                until they do or you stop the link.{" "}
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
        return owner(loading("Reading deposits and payments"), "elsewhere");
      if (state === "error")
        return owner(
          failure(
            "Payments couldn't be read just now.",
            "Payments already made are safe in Stripe. Try again in a moment.",
          ),
          "elsewhere",
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
        "elsewhere",
      );
    case "pay": {
      const base = {
        slug: "harbor-dental-k3x9q",
        clientName: XA_HARBOR.name,
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
            ? // Paid is Fieldwork Studio's link (receipt 3, Oct 12), the same
              // payment Payment links and the receipt show; Harbor Dental's stays open.
              {
                ...base,
                slug: "fieldwork-studio-p2m7t",
                clientName: "Fieldwork Studio",
                description: "Intake form and print price list",
                amountCents: 60000,
                status: "paid" as const,
                receiptNumber: 3,
              }
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
            // The one payment in this fixture: Fieldwork Studio's, as its client sees it.
            <PaidNote
              doc={receiptDoc}
              back={{
                label: "Back to the payment link",
                href: `${BASE}/pay?state=paid`,
              }}
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
          brand={harborBrand}
          initialRequest={
            state === "paid"
              ? {
                  ...businessDepositFixture,
                  businessName: XA_HARBOR.name,
                  brand: { accentColor: "#1f4e6b", logoUrl: null },
                  paid: true,
                  status: "paid",
                }
              : {
                  ...businessDepositFixture,
                  businessName: XA_HARBOR.name,
                  // Harbor Dental's own look, the same as its booking page preview.
                  brand: { accentColor: "#1f4e6b", logoUrl: null },
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
            "These prices couldn't be read just now.",
            "Nothing changed. Check you're signed in to this business and try again.",
          )
        ) : (
          <div className={styles.screen}>
            <p className={styles.note}>
              <XaTextLink href={`${BASE}/billing`}>Plan and usage</XaTextLink>
            </p>
            <XaHeadline quiet="Each one names the month it covers. Nothing here charges a card.">
              Prices you&rsquo;ve agreed to
            </XaHeadline>
            <MoneyYesTurns order={["collection", "version"]}>
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
            </MoneyYesTurns>
          </div>
        ),
        "elsewhere",
      );
    case "reconciliation":
      // Operator console only (October 16): staff work, never in a workspace shell.
      return (
        <OperatorFrame preview operatorName="Priya" moneyEnabled>
          {state === "error" ? (
            failure(
              "Payments to check couldn't be read.",
              "Only Strelva staff can open them. Sign in again and try once more.",
            )
          ) : (
            <div className={styles.screen}>
              <XaHeadline quiet="Check each one in Stripe, then write down what you found. Writing it down never moves money.">
                {state === "done"
                  ? "Every payment matches."
                  : "1 payment needs a look."}
              </XaHeadline>
              <ReviewQueue
                issues={state === "done" ? [] : reconciliationIssues}
                actorId={XS.priya}
                names={{ [XS.priya]: "Priya" }}
                accountNames={{ acct_north_studio: XA_NORTH.name }}
              />
            </div>
          )}
        </OperatorFrame>
      );
    case "creator-maintenance":
      return agency(
        state === "error" ? (
          failure(
            "Your apps couldn't be read just now.",
            "Only an owner or admin of the agency can open this. Try again in a moment.",
          )
        ) : (
          <div className={styles.screen}>
            <nav aria-label="Back" className={styles.links}>
              <XaTextLink href={`${BASE}/billing-agency`}>
                Clients you cover
              </XaTextLink>
            </nav>
            <XaHeadline quiet="Who looks after each one, and what you earn when a business pays for it.">
              Apps you made for others
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
                  item.name,
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
                creatorName: XA_NORTH.name,
                creatorWorkspaceId: XS.north,
              }}
            />,
          )
        : owner(
            state === "error" ? (
              failure(
                "Strelva couldn't check who made this.",
                "It keeps running as it is. Strelva checks again next time you open this.",
              )
            ) : (
              <SourceAttributionView
                workspaceId={XS.harbor}
                systemId={XS.system}
                creator={{
                  creatorName: XA_NORTH.name,
                  creatorWorkspaceId: XS.north,
                }}
              />
            ),
            "main",
          );
    case "payer":
      return agency(
        <div className={styles.screen}>
          <XaHeadline quiet="Owners can ask you, Maya, to cover their Strelva work.">
            What you&rsquo;re asked to pay for
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
