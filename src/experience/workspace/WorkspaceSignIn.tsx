import { SupabaseSignIn } from "@/components/auth/SupabaseSignIn";
import { AuthDocumentTitle } from "@/components/AuthDocumentTitle";
import Link from "next/link";

export function WorkspaceSignIn({ next = "/workspace" }: { next?: string }) {
  return (
    <main className="marketing-root min-h-dvh px-6 py-20">
      <AuthDocumentTitle title="Your Strelva workspace" />
      <div className="mx-auto max-w-md">
        <Link href="/workspace" className="text-sm text-m-text-2">Strelva</Link>
        <h1 className="mt-10 font-display text-4xl text-m-text">Your work starts here.</h1>
        <p className="mb-8 mt-5 leading-relaxed text-m-text-2">Sign in or create an account to save private work. You do not need a managed website or a paid plan.</p>
        <p className="mb-8 text-sm text-m-text-3">Accepting an agency handoff or saving a public scorecard? Use the email addressed to you. If your email opens a new tab, return to the handoff or scorecard and choose the action again.</p>
        <SupabaseSignIn next={next} />
      </div>
    </main>
  );
}
