/** Server-owned switch. Enable only after Supabase Auth email delivery is qualified. */
export function authEmailReady(): boolean {
  return process.env.STRELVA_AUTH_EMAIL_READY === "1";
}

/**
 * Server-owned switch for the code field. Turn it on only after the hosted
 * Supabase sign-in email carries {{ .Token }} (supabase/templates/magic-link.html);
 * until then the email holds a link only and a code field would be a dead end.
 */
export function authEmailCodeReady(): boolean {
  return authEmailReady() && process.env.STRELVA_AUTH_EMAIL_CODE === "1";
}
