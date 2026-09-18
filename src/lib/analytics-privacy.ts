const PRIVATE_PATHS = ["/workspace", "/sign-in", "/sign-up", "/auth/callback"] as const;

/** Keep private workspace and auth return targets out of the analytics client. */
export function analyticsAllowedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return !PRIVATE_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}
