"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type RefObject } from "react";
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  ClipboardList,
  Globe2,
  Layers2,
  Plus,
  Settings2,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { stageLabels, type DeliveryRequest } from "./model";
import businessImage from "./assets/business.webp";
import s from "./business.module.css";

type Props = {
  requests: DeliveryRequest[];
  empty: boolean;
  readOnly: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onStart: (title?: string, brief?: string) => void;
  onOpen: (request: DeliveryRequest) => void;
  onRequests: () => void;
};

/** A visual index of actual local request records; no invented delivery state. */
export function BusinessHome({
  requests,
  empty,
  readOnly,
  headingRef,
  onStart,
  onOpen,
  onRequests,
}: Props) {
  const [idea, setIdea] = useState("");
  return (
    <>
      <header className={s.introduction}>
        <p className={s.eyebrow}>HOME</p>
        <h1 ref={headingRef} tabIndex={-1} className="font-display">
          What should your business be able to do next?
        </h1>
        <p className={s.intro}>
          Tell Strelva what you want to make possible. We’ll work through the
          details and handle the implementation.
        </p>
        <form
          className={s.composer}
          onSubmit={(event) => {
            event.preventDefault();
            if (!readOnly && idea.trim()) onStart("", idea.trim());
          }}
        >
          <LogoMark className={s.mark} />
          <label className={s.srOnly} htmlFor="business-idea">
            Describe what you’d like to build or change
          </label>
          <input
            id="business-idea"
            placeholder="I want to…"
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            maxLength={1000}
            disabled={readOnly}
            required
            autoComplete="off"
          />
          <button
            type="submit"
            aria-label="Continue with your idea"
            disabled={readOnly || !idea.trim()}
          >
            <ArrowUp size={21} />
          </button>
        </form>
        <div className={s.suggestions} aria-label="Request ideas">
          {[
            "Set up online booking",
            "Create a client portal",
            "Improve my website",
          ].map((title) => (
            <button
              key={title}
              disabled={readOnly}
              onClick={() => onStart(title)}
            >
              {title}
            </button>
          ))}
        </div>
      </header>
      <section className={s.recent} aria-labelledby="recent-work-title">
        <div className={s.sectionHeading}>
          <h2 id="recent-work-title" className="font-display">
            Recent work
          </h2>
          <button onClick={onRequests}>
            All requests <ArrowRight size={16} />
          </button>
        </div>
        <div className={s.workList}>
          {!empty && (
            <Link className={s.workRow} href="/preview/strelva/website">
              <div className={s.thumbnail}>
                <Image src={businessImage} alt="" sizes="112px" />
              </div>
              <div className={s.workCopy}>
                <div>
                  <strong className="font-display">Managed website</strong>
                  <span className={s.status}>Example</span>
                </div>
                <p>Explore the website interface with sample content.</p>
              </div>
              <span className={s.rowAction}>
                Open <ArrowUpRight size={14} />
              </span>
            </Link>
          )}
          {requests.map((request) => (
            <button
              key={request.id}
              data-stage={request.stage}
              className={s.workRow}
              onClick={() => onOpen(request)}
            >
              <div className={s.thumbnail}>
                <Miniature
                  kind={request.stage === "review" ? "form" : "request"}
                />
              </div>
              <div className={s.workCopy}>
                <div>
                  <strong className="font-display">{request.title}</strong>
                  <span className={s.status} data-stage={request.stage}>
                    {stageLabels[request.stage]}
                  </span>
                </div>
                <p>{request.description}</p>
              </div>
              <span className={s.rowAction}>
                {request.stage === "review"
                  ? "Review"
                  : request.stage === "draft"
                    ? "Continue"
                    : "View progress"}
                <ArrowRight size={14} />
              </span>
            </button>
          ))}
          {empty && requests.length === 0 && (
            <div className={s.empty}>
              <ClipboardList size={24} />
              <h3>No requests yet</h3>
              <p>
                Start with a result your business needs. Your draft will be
                saved here.
              </p>
              <button onClick={() => onStart()} disabled={readOnly}>
                New request <Plus size={16} />
              </button>
            </div>
          )}
        </div>
        <p className={s.localNote}>
          Sample workspace. Saved requests and reviews stay in this browser.
        </p>
      </section>
    </>
  );
}

function Miniature({ kind }: { kind: "form" | "request" }) {
  return (
    <div className={s.miniature} aria-hidden="true">
      <span>{kind === "form" ? "PATIENT INTAKE" : "REQUEST"}</span>
      <b>{kind === "form" ? "A better first visit." : "Something new."}</b>
      <span className={s.miniCaption}>{kind === "form" ? "Tell us a little about yourself." : "A clear result. A place to begin."}</span>
      <i />
      <i />
      <div>
        <i />
        <i />
      </div>
      <em />
    </div>
  );
}

export function BusinessContext({
  requests,
  empty,
  readOnly,
  onBusiness,
  onIntegrations,
  onStart,
  onOpen,
}: {
  requests: DeliveryRequest[];
  empty: boolean;
  readOnly: boolean;
  onBusiness: () => void;
  onIntegrations: () => void;
  onStart: (title?: string) => void;
  onOpen: (request: DeliveryRequest) => void;
}) {
  const intake = requests.find((request) => request.id === "intake");
  return (
    <aside className={s.context} aria-label="Your business context">
      <div className={s.sectionHeading}>
        <h2 className="font-display">Your business</h2>
        <button onClick={onBusiness}>Details</button>
      </div>
      <button
        className={s.businessPhoto}
        onClick={onBusiness}
        aria-label="View Harbor Dental business details"
      >
        <Image
          src={businessImage}
          alt=""
          sizes="(min-width: 1280px) 280px, 400px"
          priority
        />
        <span>
          <strong className="font-display">Harbor Dental</strong>
          <small>Sample business · Buffalo, NY</small>
        </span>
      </button>
      <div className={s.capabilities}>
        {!empty && (
          <Link href="/preview/strelva/website">
            <Globe2 size={18} />
            <span>Website</span>
            <small>
              Example <ArrowUpRight size={12} />
            </small>
          </Link>
        )}
        {intake && (
          <button onClick={() => onOpen(intake)}>
            <ClipboardList size={18} />
            <span>Patient intake</span>
            <small data-stage={intake.stage}>{stageLabels[intake.stage]}</small>
          </button>
        )}
        <button onClick={onIntegrations}>
          <Settings2 size={18} />
          <span>Integrations</span>
          <small>Not connected</small>
        </button>
        <button
          className={s.addCapability}
          onClick={() => onStart()}
          disabled={readOnly}
        >
          <Plus size={16} /> Add capability
        </button>
      </div>
      <section className={s.brandNote}>
        <p className={s.eyebrow}>STRELVA</p>
        <h2 className="font-display">A more capable tomorrow.</h2>
        <span className={s.shortRule} />
        <p>
          Tell us what should change.
          <br />
          We’ll work through it with you.
        </p>
      </section>
    </aside>
  );
}

export function BusinessIntegrations({
  onStart,
  readOnly,
}: {
  onStart: (title?: string) => void;
  readOnly: boolean;
}) {
  return (
    <section className={s.integrationList}>
      <p>
        No services are connected to this sample business. Describe what you
        need to connect, or inspect an existing connection screen.
      </p>
      {[
        {
          icon: Globe2,
          title: "Google Business",
          copy: "Business information and reviews.",
          href: "/preview/strelva/website/dashboard/google",
        },
        {
          icon: CalendarDays,
          title: "Scheduling",
          copy: "Appointment availability and reminders.",
        },
        {
          icon: Layers2,
          title: "Your tools",
          copy: "Bring the services your business already uses.",
        },
      ].map(({ icon: Icon, title, copy, href }) => (
        <div className={s.integration} key={title}>
          <Icon size={22} />
          <div>
            <h2>{title}</h2>
            <p>{copy}</p>
            <small>Not connected</small>
          </div>
          {href ? (
            <Link href={href}>
              Inspect example <ArrowUpRight size={16} />
            </Link>
          ) : (
            <button
              disabled={readOnly}
              onClick={() => onStart(`Connect ${title.toLowerCase()}`)}
            >
              Request connection <ArrowRight size={16} />
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
