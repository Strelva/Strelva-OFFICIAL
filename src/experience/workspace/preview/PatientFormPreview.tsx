"use client";
/** XA · E5 preview: the real form component on the real Dental intake definition, fictional answers, no sends. */
import type { CSSProperties } from "react";
import { VisitorBookingShell } from "@/experience/bookings/VisitorBookingShell";
import visitor from "@/experience/bookings/visitor.module.css";
import { VisitorIntakeForm } from "@/experience/vertical-intake/VisitorIntakeForm";
import { E5_FILLED, HARBOR, e5Form } from "./xa7-outside-fixture";

export function PatientFormPreview({ state }: { state: "filled" | "blank" | "urgent" | "sent" | "sent-urgent" | "error" | "panel" }) {
  const form = e5Form();
  const harbor = { "--visitor-accent": "#1f4e6b", "--visitor-text": "#152230" } as CSSProperties;
  if (state === "panel") return <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px" }}><p style={{ fontSize: 13, color: "#6b6f68" }}>What patients see, inside Dental intake on Inquiries</p><div className={visitor.frame}><VisitorIntakeForm form={form} /></div></div>;
  const initial = state === "blank" ? {} : state === "urgent" ? { ...E5_FILLED, reason: "urgent" } : E5_FILLED;
  return <div style={harbor}>
    <VisitorBookingShell siteName={HARBOR.business} navigation={<a href={`tel:${HARBOR.phone.replace(/[^0-9]/g, "")}`}>{HARBOR.phone}</a>}>
      <VisitorIntakeForm key={state} form={form} initial={initial} visitLine={state === "blank" ? undefined : "For your visit on Wednesday, Nov 25 at 10:30 AM."}
        initialState={state === "sent" ? { sent: "routine" } : state === "sent-urgent" ? { sent: "urgent" } : state === "error" ? { error: "That didn't send. Nothing was saved. Try again, or call (716) 555-0142." } : undefined}
        onSend={async answers => { await new Promise(resolve => setTimeout(resolve, 700)); return { ok: true, triage: answers.reason === "urgent" ? "urgent" : "routine" }; }} />
    </VisitorBookingShell>
  </div>;
}
