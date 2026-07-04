import { renderEmailHtml, renderEmailText } from "@/lib/email/layout";

export function sanitizeEmailSubjectText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function inviteEmailOptions(params: {
  email?: string;
  siteName: string;
  signUpUrl: string;
}) {
  // Sanitize dynamic name/email (strip markup + newlines); the shared layout
  // auto-escapes everything we pass, so we don't pre-escape here.
  const siteName = sanitizeEmailSubjectText(params.siteName);
  const invitedEmail = params.email ? sanitizeEmailSubjectText(params.email) : null;

  const paragraphs = [
    `You now have access to manage ${siteName}. See what's happening with your site, make updates, and get weekly reports.`,
  ];
  if (invitedEmail) {
    paragraphs.push(
      `Use ${invitedEmail} when signing up so your dashboard access connects automatically.`,
    );
  }
  paragraphs.push("This link will work for the next 30 days.");

  return {
    preheader: "Your dashboard is ready.",
    heading: "Your dashboard is ready",
    paragraphs,
    button: { label: "Set up your login", url: params.signUpUrl },
  };
}

export function buildInviteEmailHtml(params: {
  email?: string;
  siteName: string;
  signUpUrl: string;
}): string {
  return renderEmailHtml(inviteEmailOptions(params));
}

export function buildInviteEmailText(params: {
  email?: string;
  siteName: string;
  signUpUrl: string;
}): string {
  return renderEmailText(inviteEmailOptions(params));
}
