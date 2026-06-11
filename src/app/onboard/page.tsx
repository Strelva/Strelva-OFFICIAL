import { redirect } from "next/navigation";

// The self-serve $149/mo onboarding flow is retired. Every build is done-for-you
// now, so /onboard redirects to the build-request intake.
//
// We forward the original query string so attribution (`?ref=`) that legacy
// /onboard links carry survives the hop — AccessRequestPage reads `ref` and
// stamps it onto the request as `referredBy`. Dropping it would silently lose
// the source of every onboard-link lead.
//
// redirect() (a temporary 307), not permanentRedirect() (a permanent 308):
// browsers and CDNs cache 308s aggressively, so a permanent redirect would
// freeze the /onboard -> /access-request mapping forever. If self-serve ever
// revives, /onboard needs to be reclaimable without fighting stale 308 caches.
export default async function OnboardRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else {
      qs.set(key, value);
    }
  }
  const query = qs.toString();
  redirect(query ? `/access-request?${query}` : "/access-request");
}
