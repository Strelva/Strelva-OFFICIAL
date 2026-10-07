/** Native booking scopes are business identities, never invented tenant rows. */
import { z } from "zod";
export function workspaceBookingScope(workspaceId: string): string {
  return `workspace:${z.string().uuid().parse(workspaceId).toLowerCase()}`;
}
export function resolveBookingScope(workspaceId: string, tenantId?: string | null): string {
  const workspaceScope = workspaceBookingScope(workspaceId);
  if (tenantId == null) return workspaceScope;
  const scope = z.string().min(1).max(80).parse(tenantId);
  if (!scope.startsWith("workspace:")) return scope;
  const parsed = workspaceBookingScope(scope.slice("workspace:".length));
  if (parsed !== workspaceScope) throw new z.ZodError([{code:"custom",path:["tenantId"],message:"Choose this business's booking System."}]);
  return parsed;
}
export function bookingScopeFor(row: { tenantId: string | null; workspaceId: string | null }): string | null {
  return row.tenantId ?? (row.workspaceId ? workspaceBookingScope(row.workspaceId) : null);
}
