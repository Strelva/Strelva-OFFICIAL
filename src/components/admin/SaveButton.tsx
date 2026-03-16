"use client";

import { useState } from "react";
import { useToast } from "./Toast";

type SaveState = "idle" | "saving";

interface SaveButtonProps {
  onClick: () => Promise<void>;
  disabled?: boolean;
}

export function SaveButton({ onClick, disabled }: SaveButtonProps) {
  const [state, setState] = useState<SaveState>("idle");
  const { toast } = useToast();

  const handleClick = async () => {
    setState("saving");
    try {
      await onClick();
      toast("Changes saved — site updated");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast(`Failed to save: ${message}`, "error");
    } finally {
      setState("idle");
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || state === "saving"}
      className="px-6 py-2.5 text-sm font-semibold rounded-lg transition-all disabled:opacity-50"
      style={{ background: "var(--sage)", color: "var(--pure-white)" }}
      onMouseEnter={(e) => {
        if (state === "idle") e.currentTarget.style.background = "var(--sage-light)";
      }}
      onMouseLeave={(e) => {
        if (state === "idle") e.currentTarget.style.background = "var(--sage)";
      }}
    >
      {state === "saving" ? "Saving..." : "Save Changes"}
    </button>
  );
}
