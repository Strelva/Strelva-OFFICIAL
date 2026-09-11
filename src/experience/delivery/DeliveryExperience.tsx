"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  ClipboardList,
  Globe2,
  Home,
  Settings2,
  Layers2,
  Plus,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { AppFrame, useHydrationReady } from "@/experience/app-frame/AppFrame";
import { stageLabels, type Audience, type DeliveryRequest } from "./model";
import { restoreLocalSession, serializeLocalSession } from "./local-store";
import { applyRequestCommand } from "./request-session";
import { clients, beginPreviewSession } from "./preview-fixture";
import styles from "./delivery.module.css";
import { useBusinessAppearance } from "./useBusinessAppearance";
import {
  BusinessHome,
  BusinessContext,
  BusinessIntegrations,
} from "./BusinessHome";
import {
  DeliveryHeader,
  DeliveryNavigation,
  DeliveryPreviewNotice,
  DeliveryRequestDetail,
  DeliveryRequestForm,
  type DeliveryNavItem,
  type DeliveryView as View,
} from "./DeliverySubviews";
const products = [
  {
    name: "Website",
    description: "Your business, clearly presented.",
    icon: Globe2,
  },
  {
    name: "Intake & forms",
    description: "Collect what you need before the first conversation.",
    icon: ClipboardList,
  },
  {
    name: "Client portal",
    description: "Give clients one place to find what they need.",
    icon: Users,
  },
];

export function DeliveryExperience({
  audience,
  scenario,
}: {
  audience: Audience;
  scenario?: string;
}) {
  const ready = useHydrationReady();
  const { appearance, theme, setAppearance } = useBusinessAppearance();
  const agency = audience === "agency";
  const empty = scenario === "empty";
  const readOnly = scenario === "read-only";
  const [unavailable, setUnavailable] = useState(scenario === "unavailable");
  const [view, setView] = useState<View>("home");
  const [session, setSession] = useState(() =>
    beginPreviewSession(audience, { empty, readOnly }),
  );
  const [restored, setRestored] = useState(false);
  const [storageError, setStorageError] = useState("");
  const storageKey = `strelva:local-review:v1:${audience}:${scenario || "default"}`;
  const requests = session.requests;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clientId, setClientId] = useState(agency ? "" : "harbor");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selected = requests.find((item) => item.id === selectedId);
  const visibleClients = agency
    ? empty
      ? []
      : clients
    : clients.filter((client) => client.id === "harbor");
  const selectedClient = clients.find((client) => client.id === clientId);
  const attention = requests.filter((item) => item.stage === "review");

  // Browser storage and location are unavailable during server rendering.
  // Restore once after hydration; subsequent writes happen in event handlers.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      setSession(
        restoreLocalSession(
          localStorage.getItem(storageKey),
          beginPreviewSession(audience, { empty, readOnly }),
        ),
      );
    } catch {
      setStorageError(
        "Saved local data could not be opened. Sample data is shown; new changes will replace the local copy.",
      );
    }
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      const brief = params.get("brief")?.slice(0, 1000);
      if (brief) setDescription(brief);
      const next = params.get("view") || (brief ? "new" : null);
      const allowed = [
        "home",
        "live",
        "requests",
        "new",
        "detail",
        "business",
        "integrations",
        "help",
        ...(agency ? ["clients"] : []),
      ];
      setView(allowed.includes(next || "") ? (next as View) : "home");
      setSelectedId(params.get("request"));
    };
    sync();
    setRestored(true);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [storageKey, audience, empty, readOnly, agency]);
  /* eslint-enable react-hooks/set-state-in-effect */
  function commit(next: typeof session) {
    setSession(next);
    try {
      localStorage.setItem(storageKey, serializeLocalSession(next));
      setStorageError("");
      return true;
    } catch {
      setStorageError(
        "Browser storage is unavailable. Your changes are only kept until this page closes or reloads. Copy your request to keep it.",
      );
      return false;
    }
  }
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    scrollRef.current?.scrollTo({ top: 0 });
  }, [view, selectedId]);
  function go(next: View, requestId?: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    url.searchParams.delete("request");
    url.searchParams.delete("brief");
    url.searchParams.delete("audience");
    if (requestId) url.searchParams.set("request", requestId);
    window.history.pushState(null, "", url);
    setView(next);
    setMobileOpen(false);
    setMessage("");
    setError("");
  }
  function start(name = "", target = agency ? "" : "harbor", brief = "") {
    setEditingId(null);
    setTitle(name);
    setDescription(brief);
    setClientId(target);
    go("new");
  }
  function open(item: DeliveryRequest) {
    setSelectedId(item.id);
    setFeedback("");
    go("detail", item.id);
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    try {
      const id = editingId || crypto.randomUUID();
      const next = applyRequestCommand(session, {
        kind: editingId ? "edit-draft" : "draft",
        id,
        clientId,
        title,
        description,
      });
      const persisted = commit(next);
      setSelectedId(id);
      go("detail", id);
      setMessage(
        persisted
          ? "Draft saved locally in this browser. Nothing has been sent to Strelva."
          : "Draft kept on this page only. Nothing has been sent to Strelva.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The draft could not be saved. Your text is still here.",
      );
    }
  }
  async function copyRequest() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(
        `${clients.find((c) => c.id === selected.clientId)?.name}\n${selected.title}\n\n${selected.description}`,
      );
      setMessage(
        "Request copied. You can share it with Strelva when you are ready.",
      );
    } catch {
      setMessage(
        "Copy was unavailable. Select and copy the request text below.",
      );
    }
  }
  function review(action: "approve" | "changes") {
    if (!selected || readOnly) return;
    try {
      commit(
        applyRequestCommand(session, {
          kind: "review",
          id: selected.id,
          decision: action,
          feedback,
        }),
      );
      setMessage(
        action === "approve"
          ? "Review recorded in this preview. Nothing was published."
          : "Feedback saved in this preview. It has not been sent.",
      );
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The review could not be saved.",
      );
    }
  }
  function rows(items: DeliveryRequest[]) {
    return (
      <div className={styles.rows}>
        {items.map((item) => (
          <button
            className={styles.requestRow}
            key={item.id}
            onClick={() => open(item)}
          >
            <span className={styles.requestIcon}>
              <Layers2 size={20} />
            </span>
            <span className={styles.rowText}>
              <strong>{item.title}</strong>
              <small>
                {clients.find((client) => client.id === item.clientId)?.name}
              </small>
            </span>
            <span className={styles.status} data-stage={item.stage}>
              {stageLabels[item.stage]}
            </span>
            <ChevronRight size={18} />
          </button>
        ))}
      </div>
    );
  }
  const nav: DeliveryNavItem[] = [
    { id: "home" as const, label: "Home", icon: Home },
    ...(agency
      ? [{ id: "clients" as const, label: "Clients", icon: Users }]
      : [{ id: "new" as const, label: "Build", icon: Plus }]),
    { id: "requests" as const, label: "Requests", icon: ClipboardList },
    {
      id: "business" as const,
      label: agency ? "Agency" : "Your business",
      icon: Layers2,
    },
    ...(!agency
      ? [
          {
            id: "integrations" as const,
            label: "Integrations",
            icon: Settings2,
          },
        ]
      : []),
  ];
  const heading =
    view === "home"
      ? agency
        ? "What will you deliver next?"
        : "What would you like to make possible?"
      : view === "clients"
        ? "Your clients"
        : view === "requests"
          ? "Implementation requests"
          : view === "new"
            ? "Tell us what you need."
            : view === "detail"
              ? selected?.title || "Request unavailable"
              : view === "live"
                ? "Your software"
                : view === "integrations"
                  ? "Integrations"
                  : view === "help"
                    ? "Help & service"
                    : agency
                      ? "North Studio"
                      : "Harbor Dental";

  if (!restored)
    return (
      <div className={styles.theme}>
        <p className={styles.notice} role="status">
          Opening local workspace…
        </p>
      </div>
    );
  return (
    <div
      className={`${styles.theme} ${!agency ? styles.businessTheme : ""}`}
      data-appearance={!agency ? theme : undefined}
      inert={!ready || undefined}
      data-delivery-ready={ready && restored}
    >
      <a className={styles.skip} href="#delivery-main">
        Skip to content
      </a>
      <AppFrame
        className={styles.frame}
        navigationStorageKey={`strelva:delivery:${audience}`}
        navigationOpen={mobileOpen}
        onCloseNavigation={() => setMobileOpen(false)}
        navigationTriggerRef={menuRef}
        contentId="delivery-main"
        navigation={<DeliveryNavigation agency={agency} view={view} nav={nav} attentionCount={attention.length} readOnly={readOnly} appearance={appearance} onAppearance={setAppearance} onClientReset={() => setClientId(agency ? "" : "harbor")} onStart={() => start()} onGo={go} onClose={() => setMobileOpen(false)} />}
        header={<DeliveryHeader agency={agency} view={view} nav={nav} mobileOpen={mobileOpen} menuRef={menuRef} onOpen={() => setMobileOpen(true)} />}
        notice={agency ? <DeliveryPreviewNotice agency={agency} /> : null}
      >
        <div ref={scrollRef} className={styles.scroll}>
          <div
            className={
              !agency && view !== "detail" && view !== "new"
                ? styles.businessLayout
                : undefined
            }
          >
            <div className={styles.page}>
              {storageError && (
                <p role="alert" className={styles.notice}>
                  {storageError}
                </p>
              )}
              {readOnly && (
                <p className={styles.notice}>
                  Read-only access. You can inspect this workspace; creating
                  requests and recording reviews are disabled.
                </p>
              )}
              {unavailable ? (
                <section className={styles.empty}>
                  <h1 ref={headingRef} tabIndex={-1} className="font-display">
                    We couldn’t load this workspace.
                  </h1>
                  <p>
                    Client and request information is unavailable. Try again to
                    restore the sample workspace.
                  </p>
                  <button
                    className={styles.primary}
                    onClick={() => setUnavailable(false)}
                  >
                    Try again
                  </button>
                </section>
              ) : (
                <>
                  {(view === "detail" || view === "new") && (
                    <button
                      className={styles.back}
                      onClick={() => go("requests")}
                    >
                      <ArrowLeft size={16} />
                      All requests
                    </button>
                  )}
                  {!(view === "home" && !agency) && (
                    <header
                      className={
                        view === "home" ? styles.hero : styles.pageHeading
                      }
                    >
                      <p className={styles.eyebrow}>
                        {view === "home"
                          ? agency
                            ? "STRELVA FOR AGENCIES"
                            : "YOUR BUSINESS, WITH STRELVA"
                          : view === "detail" && selected
                            ? clients.find((c) => c.id === selected.clientId)
                                ?.name
                            : agency
                              ? "AGENCY WORKSPACE"
                              : "BUSINESS WORKSPACE"}
                      </p>
                      <h1
                        ref={headingRef}
                        tabIndex={-1}
                        className="font-display"
                      >
                        {heading}
                      </h1>
                      {view === "home" && (
                        <>
                          <p className={styles.intro}>
                            {agency
                              ? "Turn a client’s next need into something they can use. You lead the relationship. Strelva handles the build."
                              : "Bring us what you want to build or improve. We’ll work through the details and handle the implementation."}
                          </p>
                          <button
                            className={styles.composer}
                            disabled={readOnly}
                            onClick={() => start()}
                          >
                            <Sparkles size={23} />
                            <span>
                              {agency
                                ? "What does your client need?"
                                : "Describe what you’d like to build or change…"}
                            </span>
                            <span className={styles.send}>
                              <ArrowRight size={21} />
                            </span>
                          </button>
                          <div className={styles.examples}>
                            <span>START WITH</span>
                            {[
                              "A new website",
                              "Client intake",
                              "A client portal",
                            ].map((name) => (
                              <button
                                key={name}
                                disabled={readOnly}
                                onClick={() => start(name)}
                              >
                                {name}
                                <Plus size={14} />
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      {view === "clients" && (
                        <p>
                          Client context, implementation requests, and access in
                          one place.
                        </p>
                      )}
                      {view === "requests" && (
                        <p>
                          From the first description through implementation and
                          review.
                        </p>
                      )}
                    </header>
                  )}
                  {view === "home" && !agency && (
                    <BusinessHome
                      requests={requests}
                      empty={empty}
                      readOnly={readOnly}
                      headingRef={headingRef}
                      onStart={(name, brief) => start(name, "harbor", brief)}
                      onOpen={open}
                      onRequests={() => go("requests")}
                    />
                  )}
                  {view === "integrations" && !agency && (
                    <BusinessIntegrations
                      readOnly={readOnly}
                      onStart={(name) => start(name)}
                    />
                  )}
                  {view === "help" && (
                    <section className={styles.business}>
                      <h2 className="font-display">Work with Strelva</h2>
                      <p>
                        Describe the outcome you need. Scope, price, and
                        delivery are agreed before implementation begins.
                      </p>
                      <p>
                        This local workspace uses sample data. Saving a draft or
                        recording a review does not send it to Strelva.
                      </p>
                      <a
                        className={styles.secondary}
                        href="mailto:hello@strelva.com"
                      >
                        Email hello@strelva.com
                      </a>
                      <div className={styles.actionGroup}>
                        <Link
                          className={styles.textButton}
                          href="/preview/strelva/start"
                        >
                          Explore the other interfaces <ArrowRight size={16} />
                        </Link>
                      </div>
                    </section>
                  )}
                  {message && (
                    <p className={styles.notice} role="status">
                      {message}
                    </p>
                  )}
                  {view === "home" && agency && (
                    <>
                      <section className={styles.section}>
                        <div className={styles.sectionHeading}>
                          <div>
                            <p className={styles.eyebrow}>NEXT UP</p>
                            <h2 className="font-display">
                              {attention.length
                                ? "Ready for your review"
                                : "Room for your next idea"}
                            </h2>
                          </div>
                          <button
                            className={styles.textButton}
                            onClick={() => go("requests")}
                          >
                            All requests
                            <ArrowRight size={17} />
                          </button>
                        </div>
                        {attention.length ? (
                          rows(attention)
                        ) : (
                          <div className={styles.emptyCompact}>
                            <p>
                              {empty
                                ? "No requests yet. Describe a result you need and start a draft."
                                : "Nothing needs your review right now."}
                            </p>
                            <button
                              className={styles.textButton}
                              disabled={readOnly}
                              onClick={() => start()}
                            >
                              Start a request
                              <Plus size={16} />
                            </button>
                          </div>
                        )}
                      </section>
                      <section className={styles.section}>
                        <div className={styles.sectionHeading}>
                          <div>
                            <p className={styles.eyebrow}>
                              {agency
                                ? "YOUR CLIENTS"
                                : "BUILT FOR YOUR BUSINESS"}
                            </p>
                            <h2 className="font-display">
                              {agency
                                ? "Keep the client in view."
                                : "Your software, in one place."}
                            </h2>
                          </div>
                          <button
                            className={styles.textButton}
                            onClick={() => go(agency ? "clients" : "live")}
                          >
                            View all
                            <ArrowRight size={17} />
                          </button>
                        </div>
                        {agency ? (
                          <div className={styles.clientGrid}>
                            {visibleClients.map((client) => (
                              <button
                                className={styles.clientCard}
                                key={client.id}
                                onClick={() => {
                                  setClientId(client.id);
                                  go("clients");
                                }}
                              >
                                <span className={styles.avatar}>
                                  {client.initials}
                                </span>
                                <h3>{client.name}</h3>
                                <p>{client.description}</p>
                                <span>
                                  {
                                    requests.filter(
                                      (r) => r.clientId === client.id,
                                    ).length
                                  }{" "}
                                  request
                                  <ArrowRight size={18} />
                                </span>
                              </button>
                            ))}
                            {empty && (
                              <p>
                                No clients are assigned to this sample
                                workspace.
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className={styles.software}>
                            <Globe2 size={32} strokeWidth={1.2} />
                            <div>
                              <h3>
                                {empty
                                  ? "Nothing connected yet"
                                  : "Harbor Dental website"}
                              </h3>
                              <p>
                                {empty
                                  ? "No software connected yet."
                                  : "Example managed website · Open the existing website interface."}
                              </p>
                            </div>
                            {!empty && (
                              <Link
                                className={styles.textButton}
                                href="/preview/strelva/website"
                              >
                                Open website
                                <ArrowUpRight size={17} />
                              </Link>
                            )}
                          </div>
                        )}
                      </section>
                      <section className={styles.possibilities}>
                        <div>
                          <p className={styles.eyebrow}>START A CONVERSATION</p>
                          <h2 className="font-display">
                            What else could we build?
                          </h2>
                          <p>
                            Every request starts with your needs. Scope and
                            delivery are agreed before work begins.
                          </p>
                        </div>
                        <div>
                          {products.map(
                            ({ name, description: copy, icon: Icon }) => (
                              <button
                                key={name}
                                disabled={readOnly}
                                onClick={() => start(name)}
                              >
                                <Icon size={20} />
                                <span>
                                  <strong>{name}</strong>
                                  <small>{copy}</small>
                                </span>
                                <ArrowRight size={18} />
                              </button>
                            ),
                          )}
                        </div>
                      </section>
                    </>
                  )}
                  {view === "clients" && (
                    <section className={styles.section}>
                      <label className={styles.search}>
                        <Search size={18} />
                        <input
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder="Find a client"
                          aria-label="Find a client"
                        />
                      </label>
                      <div className={styles.clientGrid}>
                        {visibleClients
                          .filter((c) =>
                            c.name.toLowerCase().includes(query.toLowerCase()),
                          )
                          .map((client) => (
                            <button
                              key={client.id}
                              className={styles.clientCard}
                              aria-pressed={clientId === client.id}
                              onClick={() => setClientId(client.id)}
                            >
                              <span className={styles.avatar}>
                                {client.initials}
                              </span>
                              <h3>{client.name}</h3>
                              <p>{client.description}</p>
                              <span>
                                View client
                                <ArrowRight size={18} />
                              </span>
                            </button>
                          ))}
                      </div>
                      {!visibleClients.some((c) =>
                        c.name.toLowerCase().includes(query.toLowerCase()),
                      ) && (
                        <div className={styles.emptyCompact}>
                          <p>
                            {query
                              ? "No clients match your search."
                              : "No clients assigned yet. Client access must be established before their resources appear here."}
                          </p>
                          {query && (
                            <button
                              className={styles.textButton}
                              onClick={() => setQuery("")}
                            >
                              Clear search
                            </button>
                          )}
                        </div>
                      )}
                      {selectedClient && (
                        <section className={styles.clientDetail}>
                          <div className={styles.sectionHeading}>
                            <div>
                              <p className={styles.eyebrow}>SELECTED CLIENT</p>
                              <h2 className="font-display">
                                {selectedClient.name}
                              </h2>
                            </div>
                            <button
                              disabled={readOnly}
                              className={styles.primary}
                              onClick={() => start("", selectedClient.id)}
                            >
                              <Plus size={18} />
                              New request
                            </button>
                          </div>
                          <p>
                            {selectedClient.description}. This preview shows
                            assigned work only; access to a client’s software is
                            granted separately.
                          </p>
                          {rows(
                            requests.filter(
                              (r) => r.clientId === selectedClient.id,
                            ),
                          )}
                          <Link
                            className={styles.textButton}
                            href="/preview/strelva/customers"
                          >
                            Inspect the existing customer-access interface
                            <ArrowUpRight size={16} />
                          </Link>
                        </section>
                      )}
                    </section>
                  )}
                  {view === "requests" && (
                    <section className={styles.section}>
                      <div className={styles.toolbar}>
                        <label>
                          Show
                          <select
                            aria-label="Show"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                          >
                            <option value="all">All requests</option>
                            <option value="draft">Drafts</option>
                            <option value="review">Needs review</option>
                            <option value="building">In implementation</option>
                            <option value="scoping">Defining scope</option>
                          </select>
                        </label>
                        <button
                          className={styles.primary}
                          disabled={readOnly}
                          onClick={() => start()}
                        >
                          <Plus size={18} />
                          New request
                        </button>
                      </div>
                      {rows(
                        requests.filter(
                          (r) => filter === "all" || r.stage === filter,
                        ),
                      )}
                      {!requests.some(
                        (r) => filter === "all" || r.stage === filter,
                      ) && (
                        <div className={styles.emptyCompact}>
                          <p>No requests in this view.</p>
                          <button
                            className={styles.textButton}
                            onClick={() => setFilter("all")}
                          >
                            Show all requests
                          </button>
                        </div>
                      )}
                    </section>
                  )}
                  {view === "new" && (
                    <DeliveryRequestForm agency={agency} empty={empty} readOnly={readOnly} clientId={clientId} title={title} description={description} error={error} onClient={setClientId} onTitle={setTitle} onDescription={setDescription} onSubmit={save} />
                  )}
                  {view === "detail" && selected && (
                    <DeliveryRequestDetail selected={selected} agency={agency} readOnly={readOnly} feedback={feedback} error={error} onFeedback={setFeedback} onReview={review} onEdit={() => { setEditingId(selected.id); setTitle(selected.title); setDescription(selected.description); setClientId(selected.clientId); go("new"); }} onCopy={() => void copyRequest()} />
                  )}
                  {view === "live" && (
                    <section className={styles.section}>
                      {empty ? (
                        <div className={styles.emptyCompact}>
                          <p>
                            No software connected yet. Start with what your
                            business needs.
                          </p>
                          <button
                            className={styles.primary}
                            disabled={readOnly}
                            onClick={() => start()}
                          >
                            New request
                          </button>
                        </div>
                      ) : (
                        <div className={styles.software}>
                          <Globe2 size={32} />
                          <div>
                            <h2 className="font-display">Your website</h2>
                            <p>
                              Explore the existing managed website interface
                              with sample content.
                            </p>
                          </div>
                          <Link
                            className={styles.primary}
                            href="/preview/strelva/website"
                          >
                            Open website
                            <ArrowUpRight size={17} />
                          </Link>
                        </div>
                      )}
                      <div className={styles.emptyCompact}>
                        <p>Need to improve something you already use?</p>
                        <button
                          className={styles.textButton}
                          disabled={readOnly}
                          onClick={() => start("Improve our website")}
                        >
                          Describe a change
                          <ArrowRight size={17} />
                        </button>
                      </div>
                    </section>
                  )}
                  {view === "business" && (
                    <section className={styles.business}>
                      <h2 className="font-display">
                        {agency
                          ? "Working with Strelva"
                          : "Your business context"}
                      </h2>
                      <p>
                        {agency
                          ? "Your team owns the client relationship. Strelva works with you to scope and implement the requested result."
                          : "Requests and delivered software belong in the context of your business. Strelva works with you on implementation and agreed ongoing care."}
                      </p>
                      <dl>
                        <dt>Workspace</dt>
                        <dd>
                          {agency
                            ? "North Studio · Agency"
                            : "Harbor Dental · Direct customer"}
                        </dd>
                        <dt>Access</dt>
                        <dd>
                          {readOnly
                            ? "Read-only sample"
                            : "Interactive sample; no live permissions"}
                        </dd>
                        <dt>Service & billing</dt>
                        <dd>
                          No agreement or billing records connected to this
                          preview.
                        </dd>
                      </dl>
                      <h2 className="font-display">
                        Need to discuss a project?
                      </h2>
                      <p>
                        Contact Strelva at hello@strelva.com. A conversation
                        establishes what we can take on.
                      </p>
                    </section>
                  )}
                </>
              )}
              <footer className={styles.footer}>
                Strelva ·{" "}
                {agency
                  ? "Implementation for your clients"
                  : "Implementation for your business"}
                {agency ? <span>Local interface study</span> : (
                  <div className={styles.previewFooter}>
                    <span>Local review · Sample business · Saved in this browser</span>
                    <Link href="/preview/strelva/start">All interfaces</Link>
                    <Link href="/preview/strelva/agency">View agency interface <ArrowUpRight size={14} /></Link>
                  </div>
                )}
              </footer>
            </div>
            {!agency && view !== "detail" && view !== "new" && !unavailable && (
              <BusinessContext
                requests={requests}
                empty={empty}
                readOnly={readOnly}
                onBusiness={() => go("business")}
                onIntegrations={() => go("integrations")}
                onStart={(name) => start(name)}
                onOpen={open}
              />
            )}
          </div>
        </div>
      </AppFrame>
    </div>
  );
}
