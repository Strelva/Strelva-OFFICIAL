import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function NoAccessPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-white mb-3">
          No access to this site
        </h1>
        <p className="text-zinc-400 mb-6">
          You&apos;re signed in, but this account is not connected to a Scaffold Web
          dashboard. If you were invited, sign in with the exact email address that
          received the invite.
        </p>
        <p className="text-sm text-zinc-500 mb-6">
          Still missing access? Contact Scaffold Web and we&apos;ll connect the right
          account.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/"
            className="px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
          >
            Go home
          </Link>
          <Link
            href="/sign-in"
            className="px-4 py-2 bg-white text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
          >
            Sign in with different account
          </Link>
        </div>
      </div>
    </div>
  );
}
