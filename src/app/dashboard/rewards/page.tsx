import { notFound } from "next/navigation";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { listRewardsMembers } from "@/lib/rewardsProxy";
import { MembersTable } from "./MembersTable";

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const tenant = await getTenantFromHeaders();
  const tenantConfig = await getTenantConfig(tenant);
  const template = tenantConfig?.template || "wellness";

  // Rewards is a food-brand-only feature. Nav already gates the link on
  // template, but anyone who hits the URL directly should see 404 instead
  // of a confusing dead-end card.
  if (template !== "food-brand") {
    notFound();
  }

  const result = await listRewardsMembers(tenant);

  if (!result.ok) {
    const message =
      result.error.kind === "unconfigured"
        ? "Rewards proxy is not configured yet. Ask an admin to set REWARDS_PROXY_SECRET on both apps."
        : result.error.kind === "unauthorized"
          ? "Rewards proxy rejected the request. The shared secret may be mismatched."
          : result.error.kind === "not-found"
            ? "No members yet."
            : `Could not reach rewards service: ${result.error.message}`;
    return (
      <div className="w-full max-w-screen-2xl mx-auto h-full overflow-y-auto p-6 md:p-8">
        <Header />
        <div className="bg-surface rounded-2xl p-12 text-center">
          <p className="text-sm text-gray-muted">{message}</p>
        </div>
      </div>
    );
  }

  const members = result.data.members;

  return (
    <div className="w-full max-w-screen-2xl mx-auto h-full overflow-y-auto p-6 md:p-8">
      <Header count={members.length} />
      {members.length === 0 ? (
        <div className="bg-surface rounded-2xl p-12 text-center">
          <p className="text-sm text-gray-muted">
            No members yet. They&apos;ll show up here once people sign up on your
            site.
          </p>
        </div>
      ) : (
        <MembersTable members={members} />
      )}
    </div>
  );
}

function Header({ count }: { count?: number }) {
  return (
    <div className="mb-8">
      <span className="text-xs uppercase tracking-widest text-gray-muted">
        REWARDS
      </span>
      <h1 className="text-2xl font-semibold tracking-tight text-warm-black mt-1">
        Members
      </h1>
      {typeof count === "number" && (
        <p className="text-sm text-gray-muted mt-1">
          {count === 0
            ? "No members yet."
            : `${count} ${count === 1 ? "member" : "members"} earning stars.`}
        </p>
      )}
    </div>
  );
}
