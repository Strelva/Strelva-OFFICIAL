import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { ForwardInquiries, type Load } from "@/experience/places/ForwardInquiries";
import { StPage } from "@/components/ui/strelva/Kit";
import type { ForwardingView } from "@/products/inquiry-forwarding/contracts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Strelva · Forward your inquiries preview", robots: { index: false, follow: false } };

const WORKSPACE = "24500000-0000-4000-8000-0000000000b1";
const address = {
  id: "24500000-0000-4000-8000-000000000301", localPart: "fwd-k3v9q2m8x7w1p4r6t0z5b2n8", status: "active" as const, issuedAs: "owner" as const,
  issuedAt: "2026-10-12T13:00:00.000Z", revokedAt: null, revokedReason: null, firstReceivedAt: null, lastReceivedAt: null, receivedCount: 0, providerConfirmation: null,
  email: "fwd-k3v9q2m8x7w1p4r6t0z5b2n8@reply.example.test",
};
const states: Record<string, Load> = {
  none: { kind: "ready", view: { canManage: true, address: null, latest: null, revoked: [] } },
  member: { kind: "ready", view: { canManage: false, address: null, latest: null, revoked: [] } },
  ready: { kind: "ready", view: { canManage: true, address, latest: null, revoked: [] } },
  confirm: { kind: "ready", view: { canManage: true, address: { ...address, providerConfirmation: { provider: "gmail", code: "123456789", url: "https://mail-settings.google.com/mail/vf-fixture", requestedBy: "pat.owner@gmail.example.test", at: "2026-10-12T13:05:00.000Z" } }, latest: null, revoked: [] } },
  arrived: { kind: "ready", view: { canManage: true, address: { ...address, firstReceivedAt: "2026-10-12T13:14:00.000Z", lastReceivedAt: "2026-10-12T13:14:00.000Z", receivedCount: 1 },
    latest: { id: "24500000-0000-4000-8000-000000000201", name: "Jane Doe", subject: "Wedding cake for June", capturedAt: "2026-10-12T13:14:00.000Z", intakeState: "kept", format: "gmail" }, revoked: [] } satisfies ForwardingView },
  loading: { kind: "loading" },
  error: { kind: "error", message: "The forwarding address couldn't load. Reload to try again." },
};

/** Fixture-only: the Forward your inquiries panel. `state` = none | member | ready | confirm | arrived | loading | error. */
export default async function InquiryForwardingPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const params = await searchParams;
  const state = states[params.state ?? "ready"] ?? states.ready!;
  return <main data-dashboard data-workspace-theme="linen" data-workspace-mode="light"><StPage><ForwardInquiries workspaceId={WORKSPACE} fixture={state} /></StPage></main>;
}
