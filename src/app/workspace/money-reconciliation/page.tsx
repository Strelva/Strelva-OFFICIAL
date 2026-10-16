import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";

/**
 * Reconciliation moved to the operator console (October 16): it is Strelva
 * staff work and never shows in an owner's or agency's workspace.
 */
export default function Page() {
  redirect("/admin/money/reconciliation");
}
