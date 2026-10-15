/** Server-owned switch. Enable only after Supabase Auth email delivery is qualified. */
export function authEmailReady(): boolean {
  return process.env.STRELVA_AUTH_EMAIL_READY === "1";
}
