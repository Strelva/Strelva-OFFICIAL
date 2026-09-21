import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { productLearningEnabled } from "@/products/product-learning/server";
import { Panel } from "../console";
import { workspaceHref } from "./workspace-href";
import { OperationalInbox } from "@/experience/operations/OperationalInbox";
import { ServiceRequestInbox } from "@/experience/operations/ServiceRequestInbox";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Internal work",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type SurfaceLink = {
  href: string;
  label: string;
  detail: string;
};

function SurfaceLinks({ links }: { links: SurfaceLink[] }) {
  return (
    <ul className="divide-y divide-glass-border">
      {links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className="block px-[18px] py-3.5 transition-colors hover:bg-glass-active"
          >
            <span className="block text-[13px] font-semibold text-warm-white">{link.label}</span>
            <span className="mt-1 block text-[12px] leading-5 text-gray-muted">{link.detail}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function InternalWorkPage() {
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get("host") || "";
  const forwardedProto = requestHeaders.get("x-forwarded-proto");
  const workspaceOpen = workspaceReleaseEnabled();
  const learningOpen = workspaceOpen && productLearningEnabled();
  const operationsHref = workspaceHref(requestHost, forwardedProto, "operations");
  const learningHref = workspaceHref(requestHost, forwardedProto, "product-learning");

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="font-display text-[26px] font-medium tracking-[-0.02em] text-warm-white sm:text-[30px]">
          Internal work
        </h1>
        <p className="mt-1.5 max-w-3xl text-[13px] leading-5 text-gray-muted">
          Open the existing surface that owns the work. This console remains restricted to super admins.
        </p>
      </header>

      <section aria-labelledby="delivery-entry-heading" className="rounded-2xl border border-warning/25 bg-warning/10 p-4">
        <h2 id="delivery-entry-heading" className="text-[13.5px] font-semibold text-warm-white">Staff delivery entry</h2>
        <p className="mt-2 max-w-3xl text-[12px] leading-5 text-gray-muted">
          Strelva staff use the exact assignment link for one owner-approved job. They do not receive this console or super-admin access. Assignment scope, expiry, acceptance, and permission are checked again before work runs.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Pre-installation service requests" className="lg:col-span-2" bodyClassName="p-[18px]">
          <ServiceRequestInbox />
        </Panel>
        <Panel title="Execution exceptions and assignments" className="lg:col-span-2" bodyClassName="p-[18px]">
          <p className="mb-4 max-w-3xl text-[12px] leading-5 text-gray-muted">
            Exact failed, accepted, and uncertain work is projected from the existing responsibility and run records. Safe actions are shown without replaying an accepted or unknown effect.
          </p>
          <OperationalInbox mode="internal" />
        </Panel>

        <Panel title="Managed-site delivery" bodyClassName="">
          <SurfaceLinks links={[
            { href: "/admin/actions", label: "Managed-site work", detail: "Review ready opportunities and pending governed actions for existing managed clients." },
            { href: "/admin/drafts", label: "Drafts", detail: "Inspect drafts that have not been published." },
            { href: "/admin/digests", label: "Maintenance", detail: "Review pending maintenance digests." },
          ]} />
        </Panel>

        <Panel title="Customer support" bodyClassName="">
          <SurfaceLinks links={[
            { href: "/admin/clients", label: "Clients", detail: "Open the current client record, site health, access, and delivery controls." },
            { href: "/admin/accounts", label: "Accounts", detail: "Inspect customer and payer groupings across managed sites." },
            { href: "/admin/leads", label: "Leads", detail: "Work received requests without treating them as accepted delivery." },
          ]} />
        </Panel>

        <Panel title="Offering development" bodyClassName="px-[18px] pb-[18px]">
          {learningOpen ? (
            <Link href={learningHref} className="mt-1 block rounded-[9px] border border-glass-border px-3.5 py-3 transition-colors hover:bg-glass-active">
              <span className="block text-[13px] font-semibold text-warm-white">Open internal product learning</span>
              <span className="mt-1 block text-[12px] leading-5 text-gray-muted">Use saved sources, evidence, decisions, builds, and outcomes in the existing research surface.</span>
            </Link>
          ) : (
            <p className="mt-1 text-[12px] leading-5 text-gray-muted">
              Internal product learning is not enabled here. It remains a local R&amp;D surface and does not establish a released offering.
            </p>
          )}
        </Panel>

        <Panel title="Operating costs" bodyClassName="px-[18px] pb-[18px]">
          {workspaceOpen ? (
            <Link href={operationsHref} className="mt-1 block rounded-[9px] border border-glass-border px-3.5 py-3 transition-colors hover:bg-glass-active">
              <span className="block text-[13px] font-semibold text-warm-white">Open ongoing work</span>
              <span className="mt-1 block text-[12px] leading-5 text-gray-muted">Inspect the approved budget and recorded usage on the exact job. There is no unsupported portfolio cost total.</span>
            </Link>
          ) : (
            <p className="mt-1 text-[12px] leading-5 text-gray-muted">
              Work budgets are unavailable while the workspace release is off. Existing billing and managed-client agreements are unchanged.
            </p>
          )}
        </Panel>

        <Panel title="Restricted system administration" className="lg:col-span-2" bodyClassName="">
          <SurfaceLinks links={[
            { href: "/admin/ops", label: "Operations", detail: "Inspect operational failures and supported recovery controls." },
            { href: "/admin/uptime", label: "Uptime", detail: "Inspect current monitored host results." },
            { href: "/admin/audit", label: "Audit", detail: "Inspect current site-audit records." },
          ]} />
        </Panel>
      </div>
    </div>
  );
}
