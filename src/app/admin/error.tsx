"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-xl bg-glass border border-glass-border p-8 text-center">
      <h2 className="text-lg font-semibold text-warm-white">
        Something broke in the operator portal
      </h2>
      <p className="text-sm text-gray-muted mt-2">
        {error.message || "An unexpected error occurred."}
      </p>
      {error.digest && (
        <p className="text-xs text-gray-faint mt-1">Ref: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="mt-4 rounded-md bg-warm-white text-surface-base px-4 py-2 text-sm font-medium"
      >
        Try again
      </button>
    </div>
  );
}
