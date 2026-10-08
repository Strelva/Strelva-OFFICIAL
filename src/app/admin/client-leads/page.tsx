import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquareText } from "lucide-react";
import { isSuperAdmin } from "@/platform/infra/auth";
import { getAllTenants } from "@/lib/tenants";
import { getClientLeadsForOperator, type OperatorClientLeads } from "@/lib/client-leads";
import { isTenantId } from "@/lib/scaffold-contracts";
import { AdminEmpty, Chip } from "@/app/admin/console";
import { ClientLeadList } from "./ClientLeadList";
import { inquiryRecordsEnabled } from "@/platform/infra/inquiry-records";
import { operatorNoticeReviewEnabled } from "@/platform/operator-queue";

export const dynamic = "force-dynamic";

function StoreStatus({ data }: { data: OperatorClientLeads }) {
  const redisOnly = data.leads.filter((lead) => lead.stored === "redis_only").length;
  const kept = data.leads.length - redisOnly;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Where these leads are stored">
      {data.postgres === "ok" ? (
        kept > 0 && <Chip tone="good">{kept} kept in Postgres</Chip>
      ) : (
        <Chip tone="warn">{data.postgres === "unconfigured" ? "Postgres not configured" : "Postgres didn't answer"}</Chip>
      )}
      {redisOnly > 0 && <Chip tone="warn">{redisOnly} only in Redis</Chip>}
      {data.redis !== "ok" && <Chip tone="warn">{data.redis === "unconfigured" ? "Redis not configured" : "Redis didn't answer"}</Chip>}
      {data.health.known && data.health.pending > 0 && (
        <Chip tone="crit">
          {data.health.pending} failed to copy{data.health.lastFailure ? ` · last: ${data.health.lastFailure.reason}` : ""}
        </Chip>
      )}
    </div>
  );
}

export default async function ClientLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string | string[] }>;
}) {
  // The layout also gates /admin; check here too so this page never reads
  // client data for anyone else, whatever renders first.
  if (!(await isSuperAdmin())) redirect("/sign-in");

  const params = await searchParams;
  const raw = Array.isArray(params.tenant) ? params.tenant[0] : params.tenant;
  const tenant = raw && isTenantId(raw) ? raw : null;
  const [data, tenants] = await Promise.all([
    getClientLeadsForOperator({ tenant, limit: 200 }),
    getAllTenants().catch(() => []),
  ]);
  const selected = tenant ? tenants.find((t) => t.id === tenant) : undefined;
  const unreadable = data.postgres !== "ok" && data.redis !== "ok";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[26px] sm:text-[30px] font-medium tracking-[-0.02em] text-warm-white">
            Client leads
          </h1>
          <p className="mt-1 max-w-xl text-sm text-gray-muted">
            What visitors sent through client websites{selected ? ` for ${selected.siteName}` : ""}. Strelva&apos;s own
            prospects are in <Link href="/admin/leads" className="text-warm-white underline-offset-2 hover:underline">Leads</Link>.
          </p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <label htmlFor="client-leads-tenant" className="sr-only">Client</label>
          <select
            id="client-leads-tenant"
            name="tenant"
            defaultValue={tenant ?? ""}
            className="h-9 min-w-0 max-w-[60vw] rounded-[9px] border border-glass-border bg-surface-raised px-2.5 text-[13px] text-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:max-w-none"
          >
            <option value="">All clients</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.siteName}</option>
            ))}
          </select>
          <button
            type="submit"
            className="h-9 rounded-[9px] border border-glass-border bg-glass px-3 text-[12.5px] font-semibold text-warm-white hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Show
          </button>
        </form>
      </div>

      <StoreStatus data={data} />
      {(inquiryRecordsEnabled() || operatorNoticeReviewEnabled()) && <Link href="/admin/client-leads/inquiries" className="inline-block text-sm text-warm-white underline focus-visible:outline focus-visible:outline-accent">Review held inquiries and owner notices</Link>}

      {unreadable ? (
        <AdminEmpty
          icon={<MessageSquareText className="h-5 w-5" strokeWidth={1.6} />}
          title="Can't read client leads right now"
          description="Neither Postgres nor Redis answered. Nothing was lost by this page; reload in a minute."
        />
      ) : data.leads.length === 0 ? (
        <AdminEmpty
          icon={<MessageSquareText className="h-5 w-5" strokeWidth={1.6} />}
          title={selected ? `No leads from ${selected.siteName} yet` : "No client leads yet"}
          description="When a visitor fills in a contact form on a client's website, it shows up here."
        />
      ) : (
        <ClientLeadList leads={data.leads} showClient={!tenant} />
      )}
    </div>
  );
}
