import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { EmailPreview } from "@/experience/workspace/preview/EmailPreview";
import { EMAIL_PREVIEW_CONTEXTS, EMAIL_PREVIEW_CONFIRM_STATES, EMAIL_PREVIEW_TEMPLATES, type EmailConfirmState, type EmailPreviewContext } from "@/experience/workspace/preview/email-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · email preview", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ template?: string; view?: string; state?: string; mode?: string; context?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const q = await searchParams;
  const template = q.template && Object.hasOwn(EMAIL_PREVIEW_TEMPLATES, q.template) ? q.template : undefined;
  const state = EMAIL_PREVIEW_CONFIRM_STATES.includes(q.state as EmailConfirmState) ? q.state as EmailConfirmState : "confirm";
  const context = q.context && Object.hasOwn(EMAIL_PREVIEW_CONTEXTS, q.context) ? q.context as EmailPreviewContext : "urgent";
  return <EmailPreview context={context} template={template} confirm={q.view === "confirm"} state={state} mode={q.mode === "dark" ? "dark" : "light"} />;
}
