"use client";

import { SignIn } from "@clerk/nextjs";

export function SignInClient({ siteName }: { siteName: string }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6"
      style={{ background: "#08080a" }}
    >
      <div className="text-center">
        <h1
          className="text-[13px] font-medium tracking-[0.15em] uppercase"
          style={{ color: "#e8e8ec" }}
        >
          {siteName}
        </h1>
      </div>
      <SignIn
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
        fallbackRedirectUrl="/account"
      />
    </div>
  );
}
