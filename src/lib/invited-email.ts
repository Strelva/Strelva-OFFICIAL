export type InvitedEmailSearchParams = {
  email?: string | string[];
};

export function getInvitedEmail(searchParams: InvitedEmailSearchParams): string | null {
  const value = Array.isArray(searchParams.email)
    ? searchParams.email[0]
    : searchParams.email;

  if (!value) return null;

  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function getAuthSwitchUrl(path: "/sign-in" | "/sign-up", invitedEmail: string | null) {
  if (!invitedEmail) return path;
  return `${path}?email=${encodeURIComponent(invitedEmail)}`;
}
