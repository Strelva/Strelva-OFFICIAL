"use client";

import type { CSSProperties } from "react";
import { SignOutButton } from "@clerk/nextjs";

interface UseInvitedEmailButtonProps {
  className?: string;
  redirectUrl?: string;
  style?: CSSProperties;
}

export function UseInvitedEmailButton({
  className,
  redirectUrl = "/sign-in",
  style,
}: UseInvitedEmailButtonProps) {
  const button = (
    <button type="button" className={className} style={style}>
      Use invited email
    </button>
  );

  return <SignOutButton redirectUrl={redirectUrl}>{button}</SignOutButton>;
}
