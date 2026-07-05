import { redirect } from "next/navigation";

// The standalone Tenants table was folded into the single client list at
// /admin/clients (one list, not three). This route stays only as a redirect so
// old links and bookmarks keep resolving.
export default function AdminTenantsPage() {
  redirect("/admin/clients");
}
