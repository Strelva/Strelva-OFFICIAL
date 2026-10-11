import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import Link from "next/link";
import type { ReactNode } from "react";
import type { OpsReport } from "@/lib/ops";
import type { HealthReport } from "@/lib/health";
import { StEmpty, StHead, StMono, StNotice, StPage, StRow, StRows, StSection, StState, StTextButton } from "@/components/ui/strelva/Kit";
import { RetryRevalidationButton } from "./RetryRevalidationButton";

/** Native anchors preserve same-page scrolling and external browser navigation. */
function OpsLink({ href, children }: { href: string; children: ReactNode }) {
  const className = "inline-flex min-h-8 items-center text-sm text-gray-muted hover:text-warm-white focus-visible:outline-2 focus-visible:outline-accent";
  return href.startsWith("#") || href.startsWith("http") ? <a href={href} className={className} {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>{children}</a> : <Link href={href} className={className}>{children}</Link>;
}

/** Count repeated failures without hiding a different newly broken site. */
function groupRevalidationFailures(failures: OpsReport["revalidationFailures"]) {
  const groups = new Map<string, { tenantId: string; url?: string; error: string; count: number }>();
  for (const failure of failures) {
    const key = `${failure.tenantId}\0${failure.url ?? ""}\0${failure.error}`;
    const prior = groups.get(key);
    if (prior) prior.count++;
    else groups.set(key, { ...failure, count: 1 });
  }
  return [...groups.values()];
}

export function OpsView({ report, health, readOnly = false }: { report: OpsReport; health: HealthReport; readOnly?: boolean }) {
  const m = report.metrics;
  const checks = Object.entries(health.checks);
  const missing = checks.filter(([, check]) => check.status === "not configured");
  const healthLabel = health.status === "down" ? "Down" : health.status === "degraded" ? "Degraded" : missing.length ? "Not configured" : "Healthy";
  const categories = [
    { title: "Webhook failures", count: m.webhookFailures, href: "https://dashboard.stripe.com/webhooks" },
    { title: "Revalidation failures", count: m.revalidationFailures, href: "#revalidation-failures" },
    { title: "Failed content writes", count: m.failedAiWrites, href: "#failed-ai-writes" },
    { title: "Open review items", count: m.totalPendingEvents, href: "/admin/actions" },
    { title: "Domain drift", count: m.tenantDomainDrift.length, href: "#domain-drift" },
  ];
  const attention = categories.filter(category => category.count > 0);
  const pending = Object.entries(m.pendingEvents).sort((a, b) => b[1] - a[1]);
  return <StPage>
    <StHead title={OPERATOR_DESTINATIONS.health.label} meta={<><StMono>{report.activeTenants}</StMono> active site{report.activeTenants === 1 ? "" : "s"} · refreshed <StMono as="time" dateTime={report.timestamp}>{new Date(report.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</StMono></>} />
    {attention.length ? <StNotice tone="need"><StState kind="need">{attention.length} {attention.length === 1 ? "area needs" : "areas need"} you</StState><div className="flex flex-wrap gap-x-6 gap-y-2 pt-2">{attention.map(category => <OpsLink key={category.title} href={category.href}>{category.count} {category.title.toLowerCase()} →</OpsLink>)}</div></StNotice> : health.status !== "healthy" ? <StNotice tone="critical"><StState kind={health.status === "down" ? "down" : "need"}>Service checks need attention</StState><p className="pt-2">Review the failing services below.</p></StNotice> : missing.length ? <StNotice><StState kind="draft">Not fully configured</StState><p className="pt-2">Nothing is failing, but {missing.map(([name]) => name).join(", ")} {missing.length === 1 ? "isn't" : "aren't"} connected yet.</p></StNotice> : <StState kind="live">All clear. Nothing broken.</StState>}
    <StSection title="Platform health" meta={<StState kind={health.status === "down" ? "down" : health.status === "degraded" ? "need" : missing.length ? "draft" : "live"}>{healthLabel}</StState>}>
      <StRows label="Service checks">{checks.map(([name, check]) => <StRow key={name} title={name.charAt(0).toUpperCase() + name.slice(1)} end={<><StState kind={check.status === "ok" ? "live" : check.status === "error" ? "down" : "draft"}>{check.status === "ok" ? "Connected" : check.status === "error" ? "Failed" : "Not configured"}</StState>{check.status === "ok" ? <StMono>{check.responseMs}ms</StMono> : null}</>} />)}</StRows>
    </StSection>
    <StSection title="Review areas"><StRows label="Operational counts">{categories.map(category => <StRow key={category.title} title={category.title} end={<><StMono tone={category.count > 0 ? "need" : undefined}>{category.count}</StMono>{category.count > 0 ? <OpsLink href={category.href}>View →</OpsLink> : null}</>} />)}</StRows></StSection>
    <StSection title="Recent revalidation failures" id="revalidation-failures">
      {report.revalidationFailures.length ? <StRows>{groupRevalidationFailures(report.revalidationFailures).map((failure, index) => <StRow key={index} title={<StTextButton href={`/admin/clients/${failure.tenantId}`}>{failure.tenantId}</StTextButton>} detail={<>{failure.url ? <StMono>{failure.url} · </StMono> : null}{failure.error}{failure.count > 1 ? <StMono> (×{failure.count})</StMono> : null}</>} end={<RetryRevalidationButton tenantId={failure.tenantId} readOnly={readOnly} />} align="start" />)}</StRows> : <StEmpty>No recent revalidation failures.</StEmpty>}
    </StSection>
    <StSection title="Domain drift" id="domain-drift">
      {m.domainDrift?.length ? <StRows>{m.domainDrift.map((item, index) => <StRow key={index} title={<StTextButton href={`/admin/clients/${item.tenantId}`}>{item.tenantId}</StTextButton>} detail={item.message} end={<StState kind="need">Needs review</StState>} />)}</StRows> : <StEmpty>{m.tenantDomainDrift.length ? "Domain drift was reported. Per-site details are unavailable." : "No drift detected."}</StEmpty>}
    </StSection>
    <StSection title="Failed content writes" id="failed-ai-writes">
      {m.failedAiWriteItems?.length ? <StRows>{m.failedAiWriteItems.map((item, index) => <StRow key={index} title={<StTextButton href={`/admin/clients/${item.tenantId}`}>{item.tenantId}</StTextButton>} detail={<>{item.title}: {item.error}</>} end={<StState kind="down">Failed</StState>} />)}</StRows> : <StEmpty>{m.failedAiWrites ? "Content writes failed. Per-site details are unavailable." : "No failed content writes to show."}</StEmpty>}
    </StSection>
    {pending.length ? <StSection title="Pending review by site" id="pending-queue" action={<StTextButton href="/admin/actions">Open Strelva Agency Queue →</StTextButton>}><StRows>{pending.map(([tenant, count]) => <StRow key={tenant} title={tenant} href={`/admin/clients/${tenant}`} end={<StMono>{count} pending</StMono>} />)}</StRows></StSection> : null}
  </StPage>;
}
