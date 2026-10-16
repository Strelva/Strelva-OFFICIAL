/** Public auth copy must never expose provider messages or account details. */
export function signInErrorCopy(error: { code?: string; status?: number }, method: "google" | "email"): string {
  if (error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
    return "Too many sign-in attempts. Wait a few minutes, then try again.";
  }
  if (method === "email") {
    if (error.code === "email_address_invalid") return "Enter a valid email address and try again.";
    return "The sign-in link could not be sent. Try again or continue with Google.";
  }
  return "Google sign-in is temporarily unavailable. Try again.";
}

/** What a refused code means to the person holding it. Never says whether the email has an account. */
export function signInCodeErrorCopy(reason: string | undefined): string {
  if (reason === "rate_limited") return "Too many tries. Wait a few minutes, then send a new code.";
  if (reason === "expired") return "That code has expired. Send a new one and use the newest email.";
  if (reason === "unavailable") return "Sign-in is unavailable just now. Try again in a minute.";
  return "That code didn’t work. Check the newest email from Strelva, or send a new code.";
}
