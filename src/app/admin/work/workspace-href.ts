import { CONTROL_PLANE_URL } from "@/lib/brand";

/**
 * The workspace is served from app.strelva.com in production, not from the
 * bare operator host. Local admin hosts keep their current port but drop the
 * admin subdomain so internal links stay on the running development server.
 */
export function workspaceHref(requestHost: string, forwardedProto: string | null, view: string): string {
  const host = requestHost.trim().toLowerCase();
  const [hostname, port] = host.split(":");
  if (hostname === "admin.localhost") {
    return `${forwardedProto === "https" ? "https" : "http"}://localhost${port ? `:${port}` : ""}/workspace?view=${encodeURIComponent(view)}`;
  }
  if (hostname === "admin.strelva.com") {
    return `${CONTROL_PLANE_URL}/workspace?view=${encodeURIComponent(view)}`;
  }
  return `/workspace?view=${encodeURIComponent(view)}`;
}
