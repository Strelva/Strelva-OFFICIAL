import type { AgencyTeam, AgencyTeamAction } from "../agency-team";

export const TEAM_AGENCY = "22222222-2222-4222-8222-222222222222";
export const TEAM_OWNER = "f1000000-0000-4000-8000-000000000001";
export const TEAM_STAFF = "f1000000-0000-4000-8000-000000000002";
export const TEAM_CLIENT = "f1000000-0000-4000-8000-000000000010";

export function agencyTeamFixture(workspaceId = TEAM_AGENCY, state = "ready"): AgencyTeam {
  const members: AgencyTeam["members"] = [
    { userId: TEAM_OWNER, email: "owner@agency.example.test", role: "owner" },
    { userId: TEAM_STAFF, email: "sam@agency.example.test", role: "member" },
    { userId: "f1000000-0000-4000-8000-000000000003", email: "operations@agency.example.test", role: "admin" },
  ];
  return { agencyWorkspaceId: workspaceId, actorUserId: state === "member" ? TEAM_STAFF : state === "admin" ? members[2]!.userId : TEAM_OWNER, canManage: state !== "member", members,
    clients: state === "empty" ? [] : [
      { customerWorkspaceId: TEAM_CLIENT, name: "The Mooney Firm", seatId: "f1000000-0000-4000-8000-000000000020", grantedByKind: "owner", grantedAt: "2026-10-07T12:00:00Z", staff: [{ userId: TEAM_STAFF, email: members[1]!.email, agencyRole: "member" }] },
      { customerWorkspaceId: "f1000000-0000-4000-8000-000000000011", name: "Lake Bakery", seatId: "f1000000-0000-4000-8000-000000000021", grantedByKind: "owner", grantedAt: "2026-10-07T12:00:00Z", staff: [] },
    ], invitations: [],
  };
}

/** Fictional preview transport only: no RPC, email or real invitation. */
export function withAgencyTeamPreview(base: typeof fetch, state = "ready"): typeof fetch {
  let team: AgencyTeam | null = null;
  return async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://preview.invalid");
    if (url.pathname !== "/api/workspace/agency-team") return base(input, init);
    if (state === "loading") return new Promise<Response>(() => {});
    if (state === "error" || state === "permission") return Response.json({ error: "Team could not be loaded." }, { status: state === "permission" ? 403 : 503 });
    team ??= agencyTeamFixture(url.searchParams.get("workspaceId") || TEAM_AGENCY, state);
    const activeTeam = team;
    if (init?.method !== "POST") return Response.json(activeTeam);
    if (!activeTeam.canManage || state === "action-error") return Response.json({ error: "The change could not be confirmed." }, { status: 403 });
    const action = JSON.parse(String(init.body)) as AgencyTeamAction;
    if (action.action === "set_role") activeTeam.members = activeTeam.members.map(member => member.userId === action.userId ? { ...member, role: action.role } : member);
    if (action.action === "remove") { activeTeam.members = activeTeam.members.filter(member => member.userId !== action.userId); activeTeam.clients.forEach(client => { client.staff = client.staff.filter(staff => staff.userId !== action.userId); }); }
    if (action.action === "assign") activeTeam.clients.forEach(client => {
      if (!action.clientIds.includes(client.customerWorkspaceId)) return;
      client.staff = client.staff.filter(staff => !action.userIds.includes(staff.userId));
      if (action.active) client.staff.push(...activeTeam.members.filter(member => action.userIds.includes(member.userId)).map(member => ({ userId: member.userId, email: member.email, agencyRole: member.role })));
    });
    if (action.action === "revoke_invitation") activeTeam.invitations = activeTeam.invitations.filter(invitation => invitation.id !== action.invitationId);
    if (action.action === "invite") {
      activeTeam.invitations.push({ id: "f1000000-0000-4000-8000-000000000030", recipientEmail: action.recipientEmail, role: action.role, status: "pending", expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() });
      return Response.json({ token: "a".repeat(43) });
    }
    return Response.json({ ok: true });
  };
}
