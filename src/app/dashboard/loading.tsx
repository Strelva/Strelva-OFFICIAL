// Loading fallback for dashboard pages. Slots into ConversationShell's main area.
export default function DashboardLoading() {
  return (
    <div className="h-full w-full flex items-center justify-center animate-pulse">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gray-bg" />
        <div className="h-2.5 w-24 bg-gray-bg rounded" />
      </div>
    </div>
  );
}
