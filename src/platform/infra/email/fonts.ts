/**
 * The one DM Sans load every Strelva email uses (paper, XA and Care plan
 * report mail), so they render the same face. Clients that strip web fonts
 * (Gmail, Outlook) fall back to the system sans stack in each template.
 */
export const EMAIL_FONT_LINKS = `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet">`;

/** "See it" and every other inline text link in an email: one style across the renderers. */
export function emailTextLinkStyle(color: string): string {
  return `color:${color};font-weight:600;text-decoration:underline;`;
}
