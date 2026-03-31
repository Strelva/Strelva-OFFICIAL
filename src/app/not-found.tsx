import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 px-6">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold mb-2">404</h1>
        <p className="text-zinc-400 mb-6">
          This page doesn&apos;t exist. It may have moved, or the link might be wrong.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium transition-colors"
        >
          Back to homepage
        </Link>
      </div>
    </div>
  );
}
