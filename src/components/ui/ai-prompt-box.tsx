"use client";

import { forwardRef, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, BrainCog, Plus, Square } from "lucide-react";
import { useDashboardOptional } from "@/components/dashboard/DashboardContext";
import { cn } from "@/lib/cn";

interface PromptQuickAction {
  label: string;
  message: string;
  description?: string;
}

interface PromptInputBoxProps {
  value: string;
  onValueChange: (value: string) => void;
  onSend: (message: string) => void;
  onStop?: () => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  quickActions?: PromptQuickAction[];
}

interface AgentUsage {
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
}

export const PromptInputBox = forwardRef<HTMLTextAreaElement, PromptInputBoxProps>(
  (
    {
      value,
      onValueChange,
      onSend,
      onStop,
      isLoading = false,
      placeholder = "Tell me what you need...",
      className,
      quickActions = [],
    },
    ref,
  ) => {
    const dashboard = useDashboardOptional();
    const [thinkMode, setThinkMode] = useState(false);
    const [actionsOpen, setActionsOpen] = useState(false);
    const [usage, setUsage] = useState<AgentUsage | null>(null);
    const [usageOpen, setUsageOpen] = useState(false);
    const localRef = useRef<HTMLTextAreaElement | null>(null);
    const actionsRef = useRef<HTMLDivElement | null>(null);
    const hasContent = value.trim().length > 0;
    const hasQuickActions = quickActions.length > 0;

    const setRefs = (node: HTMLTextAreaElement | null) => {
      localRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    };

    useEffect(() => {
      const el = localRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    }, [value]);

    useEffect(() => {
      if (!actionsOpen) return;

      const handlePointerDown = (event: PointerEvent) => {
        if (!actionsRef.current?.contains(event.target as Node)) {
          setActionsOpen(false);
        }
      };
      const handleKeyDown = (event: globalThis.KeyboardEvent) => {
        if (event.key === "Escape") setActionsOpen(false);
      };

      document.addEventListener("pointerdown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("pointerdown", handlePointerDown);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [actionsOpen]);

    const fetchUsage = () => {
      const url = dashboard?.dashboardHref("/api/agent/usage") ?? "/api/agent/usage";
      fetch(url, { credentials: "same-origin" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (
            data &&
            typeof data.limit === "number" &&
            typeof data.used === "number" &&
            typeof data.remaining === "number"
          ) {
            setUsage(data);
          }
        })
        .catch(() => {});
    };

    useEffect(() => {
      fetchUsage();
      const id = window.setInterval(fetchUsage, 15_000);
      return () => window.clearInterval(id);
      // `dashboard` is stable from context; the href value only changes when tenant base changes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dashboard?.dashboardBasePath]);

    const submit = () => {
      const trimmed = value.trim();
      if (!trimmed || isLoading) return;
      onSend(thinkMode ? `Think carefully and recommend the best next move: ${trimmed}` : trimmed);
      fetchUsage();
    };

    const runQuickAction = (message: string) => {
      if (isLoading) return;
      setActionsOpen(false);
      onSend(message);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    };

    return (
      <div
        className={cn(
          "rounded-3xl border border-glass-border bg-surface-inset p-2 shadow-[0_10px_35px_rgba(0,0,0,0.22)] transition-all duration-300 focus-within:border-accent/50 focus-within:bg-surface-raised focus-within:ring-1 focus-within:ring-accent/35",
          isLoading && "border-accent/35",
          className,
        )}
      >
        <textarea
          ref={setRefs}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={thinkMode ? "Ask for the best next move..." : placeholder}
          rows={1}
          className="block max-h-[180px] min-h-[42px] w-full resize-none overflow-y-auto rounded-2xl border-0 bg-transparent px-3 py-2.5 text-[14px] leading-relaxed text-warm-black placeholder:text-gray-subtle outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
        />

        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-1">
            {hasQuickActions && (
              <div ref={actionsRef} className="relative">
                <button
                  type="button"
                  onClick={() => setActionsOpen((current) => !current)}
                  disabled={isLoading}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/35",
                    actionsOpen
                      ? "border-accent/50 bg-accent-dim text-accent"
                      : "border-transparent text-gray-muted hover:bg-gray-bg hover:text-warm-black",
                    isLoading && "cursor-not-allowed opacity-45",
                  )}
                  aria-expanded={actionsOpen}
                  aria-haspopup="menu"
                  title="More ways to ask"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.7} />
                </button>

                {actionsOpen && (
                  <div
                    role="menu"
                    className="absolute bottom-full left-0 z-30 mb-2 w-[min(calc(100vw-3rem),330px)] overflow-hidden rounded-2xl border border-glass-border bg-surface-raised p-1.5 shadow-[0_18px_55px_rgba(0,0,0,0.35)]"
                  >
                    {quickActions.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        role="menuitem"
                        onClick={() => runQuickAction(action.message)}
                        className="block w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-gray-bg"
                      >
                        <span className="block text-[12px] font-medium text-warm-black">
                          {action.label}
                        </span>
                        {action.description && (
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-muted">
                            {action.description}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setThinkMode((current) => !current);
                setUsageOpen(true);
                fetchUsage();
              }}
              onMouseEnter={() => {
                setUsageOpen(true);
                fetchUsage();
              }}
              onMouseLeave={() => setUsageOpen(false)}
              onFocus={() => {
                setUsageOpen(true);
                fetchUsage();
              }}
              onBlur={() => setUsageOpen(false)}
              className={cn(
                "relative flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-all duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/35",
                thinkMode
                  ? "border-accent/50 bg-accent-dim text-accent"
                  : "border-transparent text-gray-muted hover:bg-gray-bg hover:text-warm-black",
              )}
              aria-pressed={thinkMode}
              aria-describedby="ai-think-usage"
            >
              <BrainCog className="h-4 w-4" strokeWidth={1.5} />
              <span className={cn("overflow-hidden whitespace-nowrap transition-all duration-300", thinkMode ? "max-w-[64px] opacity-100" : "max-w-0 opacity-0")}>
                Think
              </span>
              {usageOpen && (
                <span
                  id="ai-think-usage"
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-0 z-40 mb-2 w-max max-w-[240px] rounded-xl border border-glass-border bg-surface-raised px-3 py-2 text-left text-[11px] leading-relaxed text-warm-white shadow-[0_16px_40px_rgba(0,0,0,0.34)]"
                >
                  {usage
                    ? `AI requests left: ${usage.remaining} of ${usage.limit} this minute`
                    : "AI request budget loading..."}
                </span>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={isLoading ? onStop : submit}
            disabled={!isLoading && !hasContent}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/35",
              isLoading
                ? "bg-gray-bg-hover text-warm-black hover:bg-gray-bg"
                : hasContent
                  ? "bg-accent text-white hover:bg-accent/85"
                  : "bg-gray-border text-gray-subtle",
            )}
            title={isLoading ? "Stop generation" : "Send message"}
            aria-label={isLoading ? "Stop generation" : "Send message"}
          >
            {isLoading ? (
              <Square className="h-3.5 w-3.5 fill-current" strokeWidth={1.8} />
            ) : (
              <ArrowUp className="h-4 w-4" strokeWidth={2} />
            )}
          </button>
        </div>
      </div>
    );
  },
);
PromptInputBox.displayName = "PromptInputBox";
