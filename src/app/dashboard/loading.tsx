// This fallback is rendered inside DashboardShell's <main>. It MUST NOT
// duplicate the shell structure (h-screen, <nav>, <main>) — that nests
// <main> inside <main>, which the browser flattens and breaks hydration
// (producing "server rendered <Suspense> where client has <main>" errors
// and the classic "Cannot read properties of null (reading 'parentNode')"
// downstream crash in React reconciliation). Keep it a plain block that
// slots into the existing layout.
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
