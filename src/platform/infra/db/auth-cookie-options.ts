/** Auth sessions belong to the exact host that issued them. Never share a
 * Domain cookie with sibling tenants, even while both roots are the same. */
export function hostOnlyAuthCookieOptions<T extends { domain?: string }>(options: T): Omit<T, "domain"> {
  const hostOnly = { ...options };
  delete hostOnly.domain;
  return hostOnly;
}
