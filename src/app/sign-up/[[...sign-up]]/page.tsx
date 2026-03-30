import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--cream)" }}
    >
      <SignUp
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-none border border-[var(--cream-dark)]",
            headerTitle: "font-display",
            formButtonPrimary: "bg-[var(--sage)] hover:bg-[var(--sage-dark)]",
          },
        }}
        fallbackRedirectUrl="/dashboard"
      />
    </div>
  );
}
