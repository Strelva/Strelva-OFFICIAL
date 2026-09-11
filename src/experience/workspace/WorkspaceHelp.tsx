"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Copy, Mail } from "lucide-react";
import styles from "./workspace-surface.module.css";

export function WorkspaceHelp({ workspaceName, hasManagedService, onAgency, initialRequest = "", requestSubject = "Strelva — product help or request" }: { workspaceName?: string; hasManagedService?: boolean; onAgency?: () => void; initialRequest?: string; requestSubject?: string }) {
  const [request, setRequest] = useState(initialRequest);
  const [message, setMessage] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requestRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (initialRequest.trim()) requestRef.current?.focus();
    else headingRef.current?.focus();
  }, [initialRequest]);
  const body = `${workspaceName ? `Workspace: ${workspaceName}\n\n` : ""}${request.trim()}`;
  async function copy() {
    try { await navigator.clipboard.writeText(body); setMessage("Copied. Your request has not been sent."); }
    catch { setMessage("Copy is unavailable. Select and copy your text below."); }
  }
  return <div className={styles.page}>
    <header className={styles.pageHeader}><p className={styles.eyebrow}>People behind the product</p><h1 ref={headingRef} tabIndex={-1}>What do you need?</h1><p>Help with what you’re using, a capability you’re missing, or a project you want our team involved in.</p></header>
    <section className={styles.request} aria-labelledby="request-title"><h2 id="request-title">Tell us about it.</h2><label htmlFor="capability-request">What are you trying to do?</label><textarea ref={requestRef} id="capability-request" rows={6} maxLength={3000} value={request} onChange={event => { setRequest(event.target.value); setMessage(""); }} placeholder="What do you use today? What would make it better?" /><p>Include an example if it helps. Leave out passwords and private customer information.</p><div className={styles.requestActions}><a className={styles.primaryAction} href={`mailto:hello@strelva.com?subject=${encodeURIComponent(requestSubject)}&body=${encodeURIComponent(body)}`}><Mail size={16} />Open email</a><button type="button" disabled={!request.trim()} className={styles.secondaryAction} onClick={() => void copy()}><Copy size={16} />Copy request</button></div><p>Opens your email app. Nothing is sent until you send it; requests are not delivery commitments.</p>{message && <p role="status">{message}</p>}</section>
    <div className={styles.helpSections}><section><h2>{hasManagedService ? "Your managed service continues." : "Want our team involved?"}</h2><p>{hasManagedService ? "Your agreed service and website controls remain available. Open your website to review work, manage settings, and see its billing details." : "Talk to Strelva about a website, implementation, or ongoing service. We agree on scope before work begins."}</p><a className={styles.textAction} href="mailto:hello@strelva.com?subject=Working%20with%20Strelva">Contact the team<ArrowRight size={16} /></a></section><section><h2>Working for a customer?</h2><p>Use an agency workspace to prepare assessments and hand a copy to your customer. Access is scoped to the work that was shared; broader product management still needs a supported permission.</p>{onAgency && <button className={styles.textAction} type="button" onClick={onAgency}>Sharing & agency access<ArrowRight size={16} /></button>}</section></div>
  </div>;
}
