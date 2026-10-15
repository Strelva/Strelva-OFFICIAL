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
