import { getSupabase } from "@/platform/infra/db/client";

/** Authority checks must distinguish an ordinary account from an unreadable one.
 * The general repository's best-effort false fallback is unsafe for granting writes. */
export async function readPlatformStaffStrict(userId: string): Promise<boolean> {
  const db = getSupabase();
  if (!db) throw new Error("Platform staff check unavailable");
  const { data, error } = await db.from("super_admins").select("user_id").eq("user_id", userId).is("revoked_at", null).maybeSingle();
  if (error) throw new Error("Platform staff check unavailable");
  return data !== null;
}
