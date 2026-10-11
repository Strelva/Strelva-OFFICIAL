"use client";

import { useState } from "react";
import { StEntry, StField, StHead, StHold, StMono, StNotice, StPage, StPill, StRow, StRows, StSection, StSurface, StTextButton, StToast } from "@/components/ui/strelva/Kit";

/** Fictional profile controls. No auth, membership, sign-out or deletion calls. */
export function AccountCanonPreview() {
  const [name, setName] = useState("sheri");
  const [email, setEmail] = useState("sheri@example.invalid");
  const [edit, setEdit] = useState<"name" | "email" | "delete" | null>(null);
  const [draft, setDraft] = useState("");
  const [receipt, setReceipt] = useState("");
  function open(field: "name" | "email") { setDraft(field === "name" ? name : email); setEdit(field); }
  return <StEntry width="account" helpHref="/preview/strelva"><StPage>
    <StHead title="Your account" meta="This belongs to you, not to any business or agency you work with." />
    <StSection title="Profile" meta="How you appear to people you work with"><StRows><StRow kind="Name" title={name} end={<StTextButton onClick={() => open("name")}>Change</StTextButton>} /><StRow kind="Email" title={<StMono tone="text">{email}</StMono>} end={<StTextButton onClick={() => open("email")}>Change</StTextButton>} /></StRows>
      {edit === "name" || edit === "email" ? <StSurface label="Fictional profile edit"><form className="grid gap-4" onSubmit={event => { event.preventDefault(); if (edit === "name") setName(draft); else setEmail(draft); setEdit(null); setReceipt("Profile changed in this fictional preview. Your sign-in account is unchanged."); }}><StField label={edit === "name" ? "Name" : "Email"}><input type={edit === "email" ? "email" : "text"} required value={draft} onChange={event => setDraft(event.target.value)} /></StField><div className="flex gap-4"><StPill type="submit">Save</StPill><StTextButton onClick={() => setEdit(null)}>Cancel</StTextButton></div></form></StSurface> : null}
    </StSection>
    <StSection title="Sign-in" meta="Strelva emails you a link. There’s no password."><StRows><StRow kind="Last signed in" title="Today, this device" end={<StTextButton onClick={() => setReceipt("Fictional sign-out receipt. No session was ended.")}>Sign out everywhere</StTextButton>} /></StRows></StSection>
    <StSection title="Where you have access" meta="Businesses and agencies that invited you"><StRows><StRow kind="The Mooney Firm" title="Owner" end={<StTextButton href="/preview/strelva?scenario=mooney">Open</StTextButton>} /></StRows></StSection>
    <StSection title="Leave Strelva" meta="Deleting your account doesn’t delete a business you own. Hand it to someone first."><StTextButton tone="danger" onClick={() => setEdit("delete")}>Delete my account</StTextButton>{edit === "delete" ? <StSurface label="Fictional account deletion"><StNotice>Hand over any business you own before deleting your account. This demonstration never changes access or deletes records.</StNotice><div className="mt-4 flex flex-wrap gap-4"><StHold label="Hold to delete the example account" onAccept={() => { setEdit(null); setReceipt("Fictional deletion receipt. Your real account and all business records are unchanged."); }} /><StTextButton onClick={() => setEdit(null)}>Cancel</StTextButton></div></StSurface> : null}</StSection>
    {receipt ? <StToast>{receipt}</StToast> : null}
    <StNotice>Fictional local preview. Profile changes, signing out everywhere and account deletion are not connected to real account services.</StNotice>
  </StPage></StEntry>;
}
