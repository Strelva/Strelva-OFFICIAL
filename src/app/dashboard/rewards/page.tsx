import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { listRewardsMembers } from "@/lib/rewardsProxy";
import { MembersTable } from "./MembersTable";

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const tenant = await getTenantFromHeaders();
  const tenantConfig = await getTenantConfig(tenant);
  const template = tenantConfig?.template || "wellness";

  if (template !== "food-brand") {
    return (
      <div className="p-6 md:p-8 max-w-4xl">
        <Header />
        <div className="bg-white border border-gray-border rounded-lg p-12 text-center">
          <p className="text-sm text-gray-muted">
            Rewards is only available for food-brand sites.
          </p>
        </div>
      </div>
    );
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
      <div className="p-6 md:p-8 max-w-4xl">
        <Header />
        <div className="bg-white border border-gray-border rounded-lg p-12 text-center">
          <p className="text-sm text-gray-muted">{message}</p>
        </div>
      </div>
    );
  }

  const members = result.data.members;

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Header count={members.length} />
      {members.length === 0 ? (
        <div className="bg-white border border-gray-border rounded-lg p-12 text-center">
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
