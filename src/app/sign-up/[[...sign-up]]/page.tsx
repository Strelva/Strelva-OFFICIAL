import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 py-10"
      style={{ background: "#08080a" }}
    >
      <div className="max-w-md text-center">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#d4a052]">
          Scaffold Web
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-[#e8e8ec]">
          Create your dashboard account
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#8e8e96]">
          Use the exact email address that received your invite. That is how we
          connect your account to the right website dashboard.
        </p>
      </div>
      <SignUp
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-none !bg-[#0f0f12] border border-[#1c1c20]",
            headerTitle: "font-display !text-[#e8e8ec]",
            headerSubtitle: "!text-[#8e8e96]",
            socialButtonsBlockButton:
              "!bg-[#1c1c20] !border-[#26262b] !text-[#e8e8ec] hover:!bg-[#26262b]",
            formFieldLabel: "!text-[#8e8e96]",
            formFieldInput:
              "!bg-[#08080a] !border-[#26262b] !text-[#e8e8ec] focus:!border-[#d4a052]",
            formButtonPrimary: "!bg-[#d4a052] hover:!bg-[#c4903e] !text-[#08080a]",
            footerActionLink: "!text-[#d4a052] hover:!text-[#c4903e]",
            footerActionText: "!text-[#55555c]",
            dividerLine: "!bg-[#1c1c20]",
            dividerText: "!text-[#55555c]",
          },
        }}
        fallbackRedirectUrl="/dashboard"
      />
      <p className="max-w-md text-center text-sm leading-6 text-[#66666f]">
        If your invite email is missing or access does not appear after signup,
        contact Scaffold Web and we&apos;ll get it connected.
      </p>
    </div>
  );
}
