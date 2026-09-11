"use client";

import Link from "next/link";
import type { FormEvent, RefObject } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleHelp,
  Menu,
  Plus,
  Settings2,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { clients } from "./preview-fixture";
import { stageLabels, type DeliveryRequest } from "./model";
import styles from "./delivery.module.css";

export type DeliveryView =
  | "home"
  | "clients"
  | "live"
  | "requests"
  | "new"
  | "detail"
  | "business"
  | "integrations"
  | "help";

export type DeliveryNavItem = {
  id: DeliveryView;
  label: string;
  icon: LucideIcon;
};

export function DeliveryNavigation({
  agency,
  view,
  nav,
  attentionCount,
  readOnly,
  appearance,
  onAppearance,
  onClientReset,
  onStart,
  onGo,
  onClose,
}: {
  agency: boolean;
  view: DeliveryView;
  nav: DeliveryNavItem[];
  attentionCount: number;
  readOnly: boolean;
  appearance: "system" | "light" | "dark";
  onAppearance: (appearance: "system" | "light" | "dark") => void;
  onClientReset: () => void;
  onStart: () => void;
  onGo: (view: DeliveryView) => void;
  onClose: () => void;
}) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        {agency ? <Sparkles size={25} strokeWidth={1.4} /> : <LogoMark className={styles.businessMark} />}
        <span className="font-display">
          Strelva
          <small>{agency ? "For agencies" : "For your business"}</small>
        </span>
        <button className={styles.mobile} aria-label="Close navigation" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <nav aria-label={agency ? "Agency navigation" : "Customer navigation"}>
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-current={view === id ? "page" : undefined}
            onClick={() => {
              onClientReset();
              if (id === "new") onStart();
              else onGo(id);
            }}
          >
            <Icon size={20} strokeWidth={1.5} />
            {label}
            {id === "requests" && attentionCount > 0 ? <span className={styles.count}>{attentionCount}</span> : null}
          </button>
        ))}
      </nav>
      {agency ? (
        <div className={styles.sidebarNote}>
          <p className="font-display">{"Your relationships.\nOur implementation."}</p>
          <span>Bring the client need. Work with Strelva to get it built.</span>
          <button className={styles.primary} disabled={readOnly} onClick={onStart}>
            <Plus size={18} />
            New request
          </button>
        </div>
      ) : (
        <div className={styles.businessUtilities}>
          <label className={styles.appearance}>
            <span>Appearance</span>
            <select value={appearance} onChange={(event) => onAppearance(event.target.value as "system" | "light" | "dark")}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <button onClick={() => onGo("help")}><CircleHelp size={18} /> Help</button>
          <button onClick={() => onGo("business")}><Settings2 size={18} /> Settings</button>
          <button className={styles.textButton} disabled={readOnly} onClick={onStart}>
            <Plus size={16} /> New request
          </button>
        </div>
      )}
      <div className={styles.identity}>
        <span className={styles.avatar}>{agency ? "NS" : "HD"}</span>
        <span>
          <strong>{agency ? "North Studio" : "Harbor Dental"}</strong>
          <small>{agency ? "Agency workspace" : "Business workspace"}</small>
        </span>
      </div>
    </aside>
  );
}

export function DeliveryHeader({
  agency,
  view,
  nav,
  mobileOpen,
  menuRef,
  onOpen,
}: {
  agency: boolean;
  view: DeliveryView;
  nav: DeliveryNavItem[];
  mobileOpen: boolean;
  menuRef: RefObject<HTMLButtonElement | null>;
  onOpen: () => void;
}) {
  return (
    <div className={agency ? styles.topbar : styles.compactHeader}>
      <button ref={menuRef} className={styles.mobile} aria-label="Open navigation" aria-expanded={mobileOpen} onClick={onOpen}>
        <Menu size={20} />
      </button>
      {agency ? (
        <>
          <span>
            North Studio
            <span className={styles.breadcrumb}>
              {" / "}
              {view === "detail" ? "Request" : view === "new" ? "New request" : nav.find((item) => item.id === view)?.label}
            </span>
          </span>
          <span className={styles.topEnd}>Strelva builds with you <Sparkles size={16} /></span>
        </>
      ) : null}
    </div>
  );
}

export function DeliveryPreviewNotice({ agency }: { agency: boolean }) {
  return (
    <div className={styles.preview}>
      <span>Local review · Sample businesses · Saved in this browser</span>
      <Link href="/preview/strelva/start">All interfaces</Link>
      <Link href={`/preview/strelva/${agency ? "client" : "agency"}`}>
        View {agency ? "customer" : "agency"} interface <ArrowUpRight size={14} />
      </Link>
    </div>
  );
}

export function DeliveryRequestForm({
  agency,
  empty,
  readOnly,
  clientId,
  title,
  description,
  error,
  onClient,
  onTitle,
  onDescription,
  onSubmit,
}: {
  agency: boolean;
  empty: boolean;
  readOnly: boolean;
  clientId: string;
  title: string;
  description: string;
  error: string;
  onClient: (id: string) => void;
  onTitle: (title: string) => void;
  onDescription: (description: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <p>A clear description is enough to start. Strelva will need to confirm scope, price, and delivery before implementation.</p>
      {agency ? (
        <label>
          Client
          <select aria-label="Client" required value={clientId} onChange={(event) => onClient(event.target.value)} disabled={readOnly}>
            <option value="">Choose a client</option>
            {(empty ? [] : clients).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
      ) : <p className={styles.context}>For Harbor Dental</p>}
      {agency && empty ? <p>No clients are assigned in this scenario. A request needs an assigned client.</p> : null}
      <label>
        What do you need?
        <input required maxLength={120} value={title} onChange={(event) => onTitle(event.target.value)} placeholder="For example, an intake form for new patients" disabled={readOnly} />
      </label>
      <label>
        Describe the result
        <textarea required maxLength={4000} rows={6} value={description} onChange={(event) => onDescription(event.target.value)} placeholder="Who will use it? What should they be able to do? Tell us what happens today and what you want to change." disabled={readOnly} />
      </label>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <div className={styles.formFooter}>
        <span>Preview only. Saving does not submit a request.</span>
        <button className={styles.primary} disabled={readOnly || (agency && empty)}>
          Save draft <ArrowRight size={17} />
        </button>
      </div>
    </form>
  );
}

export function DeliveryRequestDetail({
  selected,
  agency,
  readOnly,
  feedback,
  error,
  onFeedback,
  onReview,
  onEdit,
  onCopy,
}: {
  selected: DeliveryRequest;
  agency: boolean;
  readOnly: boolean;
  feedback: string;
  error: string;
  onFeedback: (feedback: string) => void;
  onReview: (action: "approve" | "changes") => void;
  onEdit: () => void;
  onCopy: () => void;
}) {
  return (
    <div className={styles.detailGrid}>
      <section>
        <span className={styles.status} data-stage={selected.stage}>{stageLabels[selected.stage]}</span>
        <h2 className="font-display">The requested result</h2>
        <p className={styles.description}>{selected.description}</p>
        {selected.stage === "review" ? (
          <div className={styles.review}>
            <p className={styles.eyebrow}>SAMPLE IMPLEMENTATION</p>
            <h3>Patient intake form</h3>
            <p>This review artifact demonstrates the proposed fields. It does not collect patient information.</p>
            <div className={styles.sampleFields}>
              {["Patient name", "Email address", "Preferred appointment day", "Reason for your visit"].map((label) => (
                <div key={label}><span>{label}</span><span className={styles.sampleLine} /></div>
              ))}
            </div>
            <p>Review covers the fields and wording. Storage, notification delivery, and publication still need verification.</p>
          </div>
        ) : null}
        {selected.stage === "review" ? (
          <section className={styles.reviewActions}>
            <h2 className="font-display">Your review</h2>
            <label>
              Feedback
              <textarea maxLength={4000} rows={3} value={feedback} onChange={(event) => onFeedback(event.target.value)} placeholder="Describe what needs to change…" disabled={readOnly} />
            </label>
            {error ? <p role="alert" className={styles.error}>{error}</p> : null}
            <div className={styles.actionGroup}>
              <button className={styles.secondary} disabled={readOnly} onClick={() => onReview("changes")}>Save requested changes</button>
              <button className={styles.primary} disabled={readOnly} onClick={() => onReview("approve")}><Check size={17} />Record approval</button>
            </div>
            <small>Preview decisions only. Approval here does not publish or authorize a live change.</small>
          </section>
        ) : null}
        {selected.note ? <p className={styles.notice}>Recorded review: {selected.note}</p> : null}
        <div className={styles.actionGroup}>
          {selected.stage === "draft" && !readOnly ? <button className={styles.secondary} onClick={onEdit}>Edit draft</button> : null}
          {selected.stage === "draft" ? <button className={styles.secondary} onClick={onCopy}>Copy request</button> : null}
        </div>
      </section>
      <aside className={styles.deliveryAside}>
        <h3>Implementation with Strelva</h3>
        <ol>
          {["Describe the need", "Agree on scope & price", "Strelva implements", "Review the result", "Deliver & verify"].map((step, index) => (
            <li key={step}><span>{index + 1}</span>{step}</li>
          ))}
        </ol>
        <div>
          <h3>Scope & service</h3>
          <p>No commercial terms are attached to these sample requests. Delivery timing, price, and ongoing care must be agreed separately.</p>
        </div>
        <div>
          <h3>{agency ? "Client relationship" : "Business"}</h3>
          <p>{clients.find((client) => client.id === selected.clientId)?.name}</p>
          <p>{agency ? "North Studio manages the client relationship. Strelva supplies implementation." : "You review the work for your business. Strelva supplies implementation."}</p>
        </div>
      </aside>
    </div>
  );
}
