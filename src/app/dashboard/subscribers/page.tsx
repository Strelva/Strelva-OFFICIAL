import { getSubscribers } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { SubscribersTable } from "./SubscribersTable";

export const dynamic = "force-dynamic";

export default async function SubscribersPage() {
  const tenant = await getTenantFromHeaders();
  const subscribers = await getSubscribers(tenant);

  return (
    <div className="p-6 md:p-8 w-full max-w-screen-2xl mx-auto h-full overflow-y-auto">
      <div className="mb-8">
        <span className="text-xs uppercase tracking-widest text-gray-muted">
          NEWSLETTER
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-warm-black mt-1">
          Subscribers
        </h1>
        <p className="text-sm text-gray-muted mt-1">
          {subscribers.length === 0
            ? "No subscribers yet."
            : `${subscribers.length} ${subscribers.length === 1 ? "person" : "people"} on your list.`}
        </p>
      </div>

      <SubscribersTable subscribers={subscribers} />
    </div>
  );
}
