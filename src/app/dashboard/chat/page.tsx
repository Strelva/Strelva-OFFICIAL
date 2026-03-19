import { ChatPanel } from "@/components/dashboard/ChatPanel";
import { getContent } from "@/lib/storage";

export default async function ChatPage() {
  const settings = await getContent("settings");

  return (
    <div className="h-[calc(100vh-3.5rem)] md:h-screen">
      <ChatPanel ownerName={settings.ownerName || "there"} />
    </div>
  );
}
