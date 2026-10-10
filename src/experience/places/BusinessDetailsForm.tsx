"use client";

import { useState } from "react";
import { StField, StLabel, StLedger, StNotice, StPill, StRow, StRows, StSplit, StTextButton } from "@/components/ui/strelva/Kit";
import type { BusinessRecord } from "@/platform/business-record/contracts";
import { DETAIL_LABELS, EDITABLE_DETAILS, detailText, type EditableDetail } from "@/platform/business-record/details";

import { recordSource } from "./business-details-presentation";

/** Native server-action submission; this component only explains the edited fields. */
export function BusinessDetailsForm({ record, workspaceId, readOnly, approvalCopy, action }: {
  record: BusinessRecord; workspaceId: string; readOnly: boolean; approvalCopy?: string | null; action?: (formData: FormData) => Promise<void>;
}) {
  const initial = Object.fromEntries(EDITABLE_DETAILS.map(key => [key, detailText(record, key)])) as Record<EditableDetail, string>;
  const [values, setValues] = useState(initial);
  const changed = EDITABLE_DETAILS.filter(key => values[key] !== initial[key]);
  return <form action={action}>
    <input type="hidden" name="workspaceId" value={workspaceId} />
    <input type="hidden" name="revision" value={record.revision} />
    {approvalCopy ? <input type="hidden" name="googleApprovalDisclosed" value="1" /> : null}
    <StSplit aside={<>
      <StLabel>{changed.length ? "Your change will update" : "Before you save"}</StLabel>
      {changed.length ? changed.map(key => <StLedger key={key} path={DETAIL_LABELS[key]} lines={[{ sign: "-", text: initial[key] || "Not recorded" }, { sign: "+", text: values[key] || "Remove this fact" }]} />) : <p className="text-sm text-gray-muted">Edit a fact to compare its current and new value.</p>}
      <StNotice>The business record is saved here. Usage counts are not available. Connected sites and independently edited content need their own review.</StNotice>
      {approvalCopy ? <p className="text-sm text-gray-muted">{approvalCopy}</p> : null}
      {readOnly ? <p className="text-sm text-gray-muted">Only the owner can change these details.</p> : <><StPill type="submit" disabled={!changed.length}>Save details</StPill><StTextButton onClick={() => setValues(initial)} disabled={!changed.length}>Cancel changes</StTextButton></>}
    </>}>
      <StRows label="Business facts">{EDITABLE_DETAILS.map(key => <StRow key={key} title={<StField label={DETAIL_LABELS[key]} hint={`${recordSource(record.facts[key]?.source)} · ${record.facts[key]?.verified ? "Confirmed" : "Not confirmed"}`}>
        {key === "description" ? <textarea name={key} value={values[key]} readOnly={readOnly} rows={4} maxLength={2000} onChange={event => setValues({ ...values, [key]: event.target.value })} /> : <input name={key} value={values[key]} readOnly={readOnly} type={key === "phone" ? "tel" : key === "email" || key === "owner_recipient" ? "email" : "text"} maxLength={254} autoComplete="off" onChange={event => setValues({ ...values, [key]: event.target.value })} />}
      </StField>} />)}</StRows>
    </StSplit>
  </form>;
}
