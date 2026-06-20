import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { UseInvitedEmailButton } from "@/components/auth/UseInvitedEmailButton";
import { claimPendingInviteForCurrentUser, getAuthUserId } from "@/lib/auth";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";
import { isDevAccessBypassEnabled } from "@/lib/dev-access";

export default async function NoAccessPage() {
  const requestHeaders = await headers();
  const clientFallbackRoot = getClientFallbackRoot(requestHeaders);
  const targetTenant = requestHeaders.get("x-tenant") || undefined;
  const userId = await getAuthUserId();

  if (!userId && !isDevAccessBypassEnabled()) {
    redirect(withClientFallbackRoot(clientFallbackRoot, "/sign-in"));
  }

  if (userId) {
    const claimedInvite = await claimPendingInviteForCurrentUser(targetTenant);
    if (claimedInvite) {
      redirect(targetTenant ? withClientFallbackRoot(clientFallbackRoot, "/dashboard") : "/account");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-white mb-3">
          No access to this site
        </h1>
        <p className="text-zinc-400 mb-6">
          You&apos;re signed in, but this email is not connected to a Strelva
          dashboard yet. Most access issues happen when the invite was sent to a
          different email address.
        </p>
        <p className="text-sm text-zinc-500 mb-6">
          Use the exact email address that received your invite. The button
          below signs you out so you can choose that account. You can also email{" "}
          <a className="text-zinc-300 underline-offset-4 hover:underline" href="mailto:jacob@strelva.com">
            jacob@strelva.com
          </a>{" "}
          and we&apos;ll connect the right account.
        </p>
        <div className="flex flex-col gap-3 justify-center sm:flex-row">
          <UseInvitedEmailButton
            className="px-4 py-2 bg-white text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
            redirectUrl={withClientFallbackRoot(clientFallbackRoot, "/sign-in")}
          />
          <Link
            href="/account"
            className="px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
          >
            Choose another site
          </Link>
        </div>
      </div>
    </div>
  );
}
