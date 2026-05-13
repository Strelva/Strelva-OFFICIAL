import { redirect } from "next/navigation";

type LegacyOnboardSearchParams = Record<string, string | string[] | undefined>;

export default async function LegacyOnboardPage({
  searchParams,
}: {
  searchParams: Promise<LegacyOnboardSearchParams>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (value) {
      query.set(key, value);
    }
  }

  const suffix = query.toString() ? `?${query}` : "";
  redirect(`/access-request${suffix}`);
}
