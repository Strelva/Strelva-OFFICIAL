import { getSupabase } from "@/platform/infra/db/client";
import { assertRequiredConnections } from "./required-connections";

/** Governed inquiry execution retains an authenticated user's id in its
 * durable claim. Resolve that user's current verified identity, rather than
 * inventing an email or treating the worker as platform authority. */
export async function assertInstalledInquiryConnections(userId: string, workspaceId: string): Promise<void> {
  const db = getSupabase();
  if (!db || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new Error("Sign in to check this business's Connections before making it live.");
  const { data, error } = await db.auth.admin.getUserById(userId);
  const user = data?.user;
  if (error || user?.id !== userId || !user.email_confirmed_at || !user.email) throw new Error("Sign in to check this business's Connections before making it live.");
  await assertRequiredConnections({ actor: { userId, verifiedEmail: user.email }, workspaceId,
    requiredConnections: [{ provider: "resend", access: "act", optional: false, purpose: "Send inquiry routing messages" }] });
}
