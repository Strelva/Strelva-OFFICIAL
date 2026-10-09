"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput, SelectInput } from "@/components/ui/TextInput";
import { useWorkspaceRequest } from "../WorkspaceRequest";
import { parseAgencyTeam, teamRequest, type AgencyTeam, type AgencyTeamAction } from "../agency-team";

const roles = [{ value: "member", label: "Member" }, { value: "admin", label: "Admin" }];
const note = "text-xs leading-4 text-gray-muted";
const check = "flex min-h-11 items-center gap-3 text-sm text-warm-black";

export function AgencyTeamView({ workspaceId }: { workspaceId: string }) {
  const request = useWorkspaceRequest();
  const [attempt, setAttempt] = useState(0);
  const [stored, setStored] = useState<{ attempt: number; team?: AgencyTeam; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const current = stored?.attempt === attempt ? stored : null;
  const team = current?.team;

  useEffect(() => {
    const controller = new AbortController();
    void teamRequest(request, workspaceId, undefined, controller.signal).then(value => {
      const team = parseAgencyTeam(value, workspaceId);
      if (!controller.signal.aborted) {
        setStored({ attempt, team }); setStale(false);
        setSelectedStaff(values => values.filter(id => team.members.some(member => member.userId === id)));
        setSelectedClients(values => values.filter(id => team.clients.some(client => client.customerWorkspaceId === id)));
      }
    }).catch(() => {
      if (!controller.signal.aborted) setStored({ attempt, error: "Team could not be loaded. Access has not changed." });
    });
    return () => controller.abort();
  }, [request, workspaceId, attempt]);

  const reload = () => { setError(""); setRemoving(null); setAttempt(value => value + 1); };
  const mutate = async (action: AgencyTeamAction, success: string) => {
    if (busy || stale || !team?.canManage) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const result = await teamRequest(request, workspaceId, action);
      if (action.action === "invite") {
        const token = result && typeof result === "object" && "token" in result ? result.token : null;
        if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Invitation could not be confirmed. Reload before trying again.");
        setLink(new URL(`/workspace/invitations/accept/${token}`, window.location.origin).toString());
        setEmail("");
      }
      setMessage(success); setRemoving(null);
      try {
        const refreshed = parseAgencyTeam(await teamRequest(request, workspaceId), workspaceId);
        setStored({ attempt, team: refreshed });
        setSelectedStaff(values => values.filter(id => refreshed.members.some(member => member.userId === id)));
        setSelectedClients(values => values.filter(id => refreshed.clients.some(client => client.customerWorkspaceId === id)));
      } catch { setStale(true); setError("The change was confirmed, but the updated team could not be loaded. Reload before making another change."); }
    } catch (error) {
      setStale(true);
      setError(`${error instanceof Error ? error.message : "The change could not be confirmed."} Reload before making another change.`);
    } finally { setBusy(false); }
  };
  const toggle = (values: string[], value: string) => values.includes(value) ? values.filter(item => item !== value) : [...values, value];
  const disabled = busy || stale;

  if (!current) return <p role="status" className="py-5 text-sm text-gray-muted">Loading team…</p>;
  if (!team) return <div role="alert" className="flex flex-wrap items-center justify-between gap-4 border-y border-gray-border py-5"><p className="text-sm">{current.error}</p><Button variant="secondary" onClick={reload}>Retry team</Button></div>;

  return <div aria-busy={busy || undefined} className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <p className={`${note} max-w-xl`}>Assigned staff with a confirmed email can act as client operators while the agency has an active agency seat and they remain on this team. Clients can end the agency’s access.</p>
      <Button variant="secondary" size="sm" disabled={busy} onClick={reload}>Reload team</Button>
    </div>
    {!team.canManage ? <p className={note}>Only agency owners and admins can invite people or change client assignments.</p> : null}
    {message ? <p role="status" className="text-sm text-positive">{message}</p> : null}
    {error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}
    {team.canManage ? <form className="grid items-end gap-4 border-y border-gray-border py-6 sm:grid-cols-[minmax(0,1fr)_160px_auto]" onSubmit={event => { event.preventDefault(); void mutate({ action: "invite", workspaceId, recipientEmail: email, role: inviteRole as "admin" | "member" }, "Invitation created. Share the link with this person."); }}>
      <TextInput label="Staff email" type="email" required maxLength={254} value={email} disabled={disabled} onChange={event => setEmail(event.target.value)} />
      <SelectInput label="Invitation role" options={roles} value={inviteRole} disabled={disabled} onChange={event => setInviteRole(event.target.value)} />
      <Button type="submit" disabled={disabled || !email.trim()} loading={busy}>Create invitation</Button>
      <p className={`${note} sm:col-span-3`}>The person accepts with this email before you assign clients. Creating a link does not send an email.</p>
    </form> : null}
    {link ? <div className="space-y-2"><TextInput label="Invitation link" readOnly value={link} onFocus={event => event.target.select()} /><p className={note}>Share this private link with the invited person. It expires in seven days.</p></div> : null}
    {team.canManage && team.invitations.length ? <section aria-label="Pending invitations"><h3 className="text-sm font-medium">Pending invitations</h3><ul className="mt-3 divide-y divide-gray-border border-y border-gray-border">{team.invitations.map(invitation => <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><span className="min-w-0 break-words text-sm">{invitation.recipientEmail}<small className={`${note} mt-1 block`}>{invitation.role} · Expires {new Date(invitation.expiresAt).toLocaleDateString()}</small></span>{invitation.role !== "owner" ? <Button variant="ghost" disabled={disabled} onClick={() => void mutate({ action: "revoke_invitation", workspaceId, invitationId: invitation.id }, "Invitation revoked.")}>Revoke invitation</Button> : null}</li>)}</ul></section> : null}
    {team.canManage && team.members.length && team.clients.length ? <details className="border-y border-gray-border py-4">
      <summary className="min-h-11 cursor-pointer text-sm font-medium">Assign several people or clients</summary>
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <fieldset disabled={disabled}><legend className={note}>People</legend>{team.members.map(member => <label key={member.userId} className={`${check} break-all`}><input type="checkbox" checked={selectedStaff.includes(member.userId)} onChange={() => setSelectedStaff(toggle(selectedStaff, member.userId))} />{member.email}</label>)}</fieldset>
        <fieldset disabled={disabled}><legend className={note}>Clients with active seats</legend>{team.clients.map(client => <label key={client.customerWorkspaceId} className={check}><input type="checkbox" checked={selectedClients.includes(client.customerWorkspaceId)} onChange={() => setSelectedClients(toggle(selectedClients, client.customerWorkspaceId))} />{client.name}</label>)}</fieldset>
      </div>
      <p className={`${note} my-4`}>{selectedStaff.length} people · {selectedClients.length} clients. Up to 200 assignments at once. The whole selection succeeds or nothing changes.</p>
      <div className="flex flex-wrap gap-3">{[true, false].map(active => <Button key={String(active)} variant={active ? "primary" : "secondary"} disabled={disabled || !selectedStaff.length || !selectedClients.length || selectedStaff.length * selectedClients.length > 200} onClick={() => void mutate({ action: "assign", workspaceId, userIds: selectedStaff, clientIds: selectedClients, active }, active ? "Selected client assignments added." : "Selected client assignments removed.")}>{active ? "Assign selected" : "Unassign selected"}</Button>)}</div>
    </details> : null}
    {!team.clients.length ? <p className={note}>No clients have an active agency seat. A client must choose this agency before staff can be assigned.</p> : null}
    {!team.members.length ? <p className={note}>No team members are listed for this agency.</p> : <ul aria-label="Agency team" className="divide-y divide-gray-border border-y border-gray-border">{team.members.map(member => {
      const clients = team.clients.filter(client => client.staff.some(staff => staff.userId === member.userId));
      const protectedMember = member.role === "owner" || member.userId === team.actorUserId;
      return <li key={member.userId} className="space-y-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1"><h3 className="break-all text-sm font-medium">{member.email}</h3><p className={`${note} mt-1`}>{member.role === "owner" ? "Owner" : member.role === "admin" ? "Admin" : "Member"}{member.userId === team.actorUserId ? " · You" : ""}</p><p className={`${note} mt-2`}>{clients.length ? `Client operator: ${clients.map(client => client.name).join(", ")}` : "No assigned clients"}</p></div>
          {team.canManage && !protectedMember ? <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto"><SelectInput label={`Agency role for ${member.email}`} value={member.role} options={roles} disabled={disabled} onChange={event => void mutate({ action: "set_role", workspaceId, userId: member.userId, role: event.target.value as "admin" | "member" }, "Agency role updated.")} /><Button variant="ghost" disabled={disabled} onClick={() => setRemoving(member.userId)}>Remove staff</Button></div> : null}
        </div>
        {removing === member.userId ? <div className="space-y-3" role="group" aria-label={`Confirm removal of ${member.email}`}><p className="text-sm">Remove {member.email} from this agency? All their client assignments will end.</p><div className="flex flex-wrap gap-3"><Button variant="danger" disabled={disabled} onClick={() => void mutate({ action: "remove", workspaceId, userId: member.userId }, "Staff removed. Their client assignments have ended.")}>Confirm removal</Button><Button variant="secondary" disabled={busy} onClick={() => setRemoving(null)}>Cancel removal</Button></div></div> : null}
        {team.canManage && team.clients.length ? <details><summary className="min-h-11 cursor-pointer text-sm">Client assignments for {member.email}</summary><fieldset disabled={disabled} className="mt-2"><legend className="sr-only">Clients for {member.email}</legend>{team.clients.map(client => <label key={client.customerWorkspaceId} className={check}><input type="checkbox" checked={client.staff.some(staff => staff.userId === member.userId)} onChange={event => void mutate({ action: "assign", workspaceId, userIds: [member.userId], clientIds: [client.customerWorkspaceId], active: event.target.checked }, "Client assignment updated.")} />{client.name}</label>)}</fieldset></details> : null}
      </li>;
    })}</ul>}
  </div>;
}
