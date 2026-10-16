"use client";

import { XaButton, type XaButtonVariant } from "@/components/ui/strelva/Xa";
import type { ReactNode } from "react";
import { createBrowserSupabase } from "@/platform/infra/db/browser-client";

interface UseInvitedEmailButtonProps {
  redirectUrl?: string;
  variant?: XaButtonVariant;
  block?: boolean;
  children?: ReactNode;
}

/** Signs out, then opens sign-in so the person can choose the address their invitation went to. */
export function UseInvitedEmailButton({ redirectUrl = "/sign-in", variant = "primary", block = true, children = "Use my invited email" }: UseInvitedEmailButtonProps) {
  async function signOut() {
    const supabase = createBrowserSupabase();
    if (supabase) await supabase.auth.signOut();
    window.location.href = redirectUrl;
  }
  return <XaButton type="button" variant={variant} size="lg" block={block} onClick={signOut}>{children}</XaButton>;
}
