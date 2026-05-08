export function sanitizeEmailSubjectText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string): string {
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

export function buildInviteEmailHtml(params: {
  siteName: string;
  signUpUrl: string;
}): string {
  const safeSiteName = escapeHtml(sanitizeEmailSubjectText(params.siteName));
  const safeSignUpUrl = escapeHtml(params.signUpUrl);

  return `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <h1 style="font-size: 24px; font-weight: 600; color: #111; margin-bottom: 16px;">
        Your dashboard is ready
      </h1>
      <p style="font-size: 16px; color: #444; line-height: 1.6; margin-bottom: 24px;">
        You now have access to manage <strong>${safeSiteName}</strong>.
        See what's happening with your site, make updates, and get weekly reports.
      </p>
      <a href="${safeSignUpUrl}" style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
        Create your account
      </a>
      <p style="font-size: 14px; color: #888; margin-top: 32px;">
        This link will work for the next 30 days.
      </p>
    </div>
  `;
}

export function buildInviteEmailText(params: {
  siteName: string;
  signUpUrl: string;
}): string {
  const siteName = sanitizeEmailSubjectText(params.siteName);

  return [
    "Your dashboard is ready",
    "",
    `You now have access to manage ${siteName}.`,
    "See what's happening with your site, make updates, and get weekly reports.",
    "",
    `Create your account: ${params.signUpUrl}`,
    "",
    "This link will work for the next 30 days.",
  ].join("\n");
}
