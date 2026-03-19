import Link from "next/link";
import { Globe, FileText } from "lucide-react";
import { ChatPanel } from "@/components/dashboard/ChatPanel";
import { getContent } from "@/lib/storage";

export default async function ChatPage() {
  const settings = await getContent("settings");

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen">
      <div className="flex-1 min-h-0">
        <ChatPanel ownerName={settings.ownerName || "there"} />
      </div>
      <div className="flex items-center gap-4 px-4 py-2 border-t border-[#262626] bg-[#0a0a0a] text-xs text-zinc-500">
        <Link href="/dashboard/site" className="flex items-center gap-1.5 hover:text-zinc-300 transition-colors">
          <Globe className="w-3 h-3" /> View your site
        </Link>
        <Link href="/dashboard/content" className="flex items-center gap-1.5 hover:text-zinc-300 transition-colors">
          <FileText className="w-3 h-3" /> Browse content
        </Link>
      </div>
    </div>
  );
}
