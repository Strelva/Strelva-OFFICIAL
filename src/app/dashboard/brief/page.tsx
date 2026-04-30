import { FileText } from "lucide-react";

export default function BriefPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full animate-page-enter">
      <div className="w-16 h-16 rounded-2xl bg-surface-inset flex items-center justify-center mb-6">
        <FileText className="w-7 h-7 text-gray-muted" strokeWidth={1.5} />
      </div>
      <h1 className="text-[18px] font-semibold text-warm-black mb-2">Weekly Brief</h1>
      <p className="text-[13px] text-gray-muted text-center max-w-xs">
        Your weekly performance summary and AI-generated insights will appear here.
      </p>
      <p className="text-[12px] text-gray-subtle mt-4">Coming soon</p>
    </div>
  );
}
