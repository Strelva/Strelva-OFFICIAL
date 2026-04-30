import { redirect } from "next/navigation";
import { getTenantFromHeaders } from "@/lib/tenant";
import { hasTenantAccess } from "@/lib/auth";
import { getContent } from "@/lib/storage";
import { ChatPageClient } from "./ChatPageClient";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const params = await searchParams;
  const tenant = await getTenantFromHeaders();

  const allowed = await hasTenantAccess(tenant);
  if (!allowed) redirect("/");

  let ownerName = "there";
  try {
    const settings = await getContent("settings", tenant);
    ownerName = settings.ownerName || ownerName;
  } catch {}

  return (
    <ChatPageClient
      threadId={params.thread}
      ownerName={ownerName}
    />
  );
}
