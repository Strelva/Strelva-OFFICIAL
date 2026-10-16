"use client";

import { forwardRef, useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUp,
  BarChart3,
  BrainCog,
  CalendarDays,
  ChevronRight,
  Files,
  Link2,
  Mail,
  MessageSquareText,
  Paperclip,
  Plus,
  Search,
  Square,
  Star,
} from "lucide-react";
import { useDashboardOptional } from "@/components/dashboard/DashboardContext";
import { cn } from "@/lib/cn";

interface PromptQuickAction {
  label: string;
  message: string;
  description?: string;
  icon?: LucideIcon;
}

interface PromptInputBoxProps {
  value: string;
  onValueChange: (value: string) => void;
  onSend: (message: string) => void;
  onFilesUploaded?: (files: UploadedFile[]) => void;
  onStop?: () => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  quickActions?: PromptQuickAction[];
}

export interface UploadedFile {
  name: string;
  url: string;
}

interface AgentUsage {
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
}

interface MenuLinkAction {
  label: string;
  href: string;
  description?: string;
  icon: LucideIcon;
}

interface SourcePromptAction {
  label: string;
  message: string;
  description?: string;
  icon: LucideIcon;
}

const FILE_ACTIONS: MenuLinkAction[] = [
  {
    label: "Open file library",
    href: "/dashboard/assets",
    description: "Manage reusable images and files.",
    icon: Files,
  },
];

const AI_CONTEXT_ACTIONS: SourcePromptAction[] = [
  {
    label: "Update brand guidance",
    message: "Update the brand guidance you use for future site changes. Ask me what visual or tone rules should change before saving anything.",
    description: "Brand rules live in chat.",
    icon: Star,
  },
  {
    label: "Update business hours",
    message: "Help me update my business hours. Ask for the new hours, check where they appear, and queue the right site or listing updates.",
    description: "Hours as an AI task.",
    icon: CalendarDays,
  },
  {
    label: "Set AI rules",
    message: "Help me set persistent AI rules for my business. Ask what boundaries, tone, offers, or facts you should always follow.",
    description: "Persistent instructions.",
    icon: BrainCog,
  },
  {
    label: "Custom site request",
    message: "I need a custom design or code change that is beyond normal content editing. Create a Strelva request from this chat and ask me for the exact change, page, and section.",
    description: "Routes to Strelva.",
    icon: MessageSquareText,
  },
];

const SOURCE_ACTIONS: SourcePromptAction[] = [
  {
    label: "Website Activity",
    message: "@Website Activity What are visitors doing on my site that I should act on?",
    description: "Visitor and click signals.",
    icon: BarChart3,
  },
  {
    label: "Google Business",
    message: "@Google Business Any review or listing updates I should act on?",
    description: "Reviews and listing context.",
    icon: Star,
  },
  {
    label: "Search Console",
    message: "@Search Console What are people searching for that my site should mention?",
    description: "Search terms and SEO.",
    icon: Search,
  },
  {
    label: "Main CTA",
    message: "@Main CTA Is my main site action clear enough?",
    description: "CTA click context.",
    icon: CalendarDays,
  },
  {
    label: "Newsletter",
    message: "@Newsletter Draft an update based on the latest site changes.",
    description: "Draft customer emails.",
    icon: Mail,
  },
];

export const PromptInputBox = forwardRef<HTMLTextAreaElement, PromptInputBoxProps>(
  (
    {
      value,
      onValueChange,
      onSend,
      onFilesUploaded,
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
    const [connectionsOpen, setConnectionsOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [usage, setUsage] = useState<AgentUsage | null>(null);
    const [usageOpen, setUsageOpen] = useState(false);
    const hoverTimerRef = useRef<number | null>(null);
    const localRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
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

    useEffect(() => {
      return () => {
        if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
      };
    }, []);

    const openUsageSoon = () => {
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = window.setTimeout(() => {
        setUsageOpen(true);
        fetchUsage();
      }, 450);
    };

    const closeUsage = () => {
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      setUsageOpen(false);
    };

    const submit = () => {
      const trimmed = value.trim();
      if (!trimmed || isLoading) return;
      onSend(thinkMode ? `Think carefully and recommend the best next move: ${trimmed}` : trimmed);
      fetchUsage();
    };

    const runQuickAction = (message: string) => {
      if (isLoading) return;
      setActionsOpen(false);
      setConnectionsOpen(false);
      onSend(message);
    };

    const insertSourcePrompt = (message: string) => {
      if (isLoading) return;
      onValueChange(message);
      setActionsOpen(false);
      setConnectionsOpen(false);
      requestAnimationFrame(() => localRef.current?.focus());
    };

    const actionHref = (path: string) => dashboard?.dashboardHref(path) ?? path;

    const handleUploadFiles = async (files: FileList | null) => {
      if (!files?.length || uploading) return;
      setUploading(true);
      try {
        const uploaded: UploadedFile[] = [];
        for (const file of Array.from(files)) {
          const formData = new FormData();
          formData.append("file", file);
          const response = await fetch(actionHref("/api/upload"), {
            method: "POST",
            credentials: "same-origin",
            body: formData,
          });
          if (!response.ok) continue;
          const body = await response.json();
          if (typeof body?.url === "string") {
            uploaded.push({ name: file.name, url: body.url });
          }
        }
        if (uploaded.length) {
          onFilesUploaded?.(uploaded);
          const fileList = uploaded.map((file) => file.name).join(", ");
          onValueChange(value ? `${value}\n\nAttached: ${fileList}` : `Use these uploaded files as context: ${fileList}`);
          requestAnimationFrame(() => localRef.current?.focus());
        }
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
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
          "ai-prompt-box rounded-[28px] bg-[var(--st-surface,var(--surface))] p-2 shadow-[var(--st-shadow-sm)] transition-shadow duration-(--motion-fast) focus-within:shadow-[var(--st-shadow-lg)]",
          className,
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => void handleUploadFiles(event.currentTarget.files)}
        />
        <textarea
          ref={setRefs}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={thinkMode ? "Ask for the best next move..." : placeholder}
          aria-label="Message the AI about your site"
          rows={1}
          className="block max-h-[180px] min-h-[42px] w-full resize-none overflow-y-auto rounded-2xl border-0 bg-transparent px-3 py-2.5 text-[15px] leading-relaxed text-warm-black caret-warm-black placeholder:text-[var(--st-faint,var(--gray-subtle))] outline-none ring-0 transition-none focus:bg-transparent focus:outline-none focus:ring-0 focus:ring-transparent focus-visible:bg-transparent focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-transparent"
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
                    "flex h-8 w-8 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--st-accent,var(--accent))]",
                    actionsOpen
                      ? "border-transparent bg-[var(--st-selected,var(--gray-bg))] text-warm-black"
                      : "border-transparent text-gray-muted hover:bg-[var(--st-hover,var(--gray-bg-hover))] hover:text-warm-black",
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
                      className="absolute bottom-full left-0 z-30 mb-2 w-[min(calc(100vw-2rem),360px)] overflow-visible rounded-2xl border border-[var(--st-line,var(--gray-border))] bg-[var(--st-surface,var(--surface-popover))] text-[var(--st-text-2,var(--text-popover))] p-1.5 shadow-[var(--st-shadow-lg)]"
                    >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-warm-black transition-colors hover:bg-[var(--st-hover,var(--gray-bg-hover))] disabled:opacity-50"
                    >
                      <Paperclip className="h-5 w-5 shrink-0 text-gray-fg" strokeWidth={1.7} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium">
                          {uploading ? "Uploading..." : "Upload photos & files"}
                        </span>
                        <span className="mt-0.5 block truncate text-[13px] text-[var(--st-text-3,var(--text-popover))]">
                          Attach files to this AI request.
                        </span>
                      </span>
                    </button>

                    {FILE_ACTIONS.map((action) => (
                      <a
                        key={action.label}
                        href={actionHref(action.href)}
                        role="menuitem"
                        onClick={() => {
                          setActionsOpen(false);
                          setConnectionsOpen(false);
                        }}
                        className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-warm-black transition-colors hover:bg-[var(--st-hover,var(--gray-bg-hover))]"
                      >
                        <action.icon className="h-5 w-5 shrink-0 text-gray-fg" strokeWidth={1.7} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium">{action.label}</span>
                          {action.description && (
                            <span className="mt-0.5 block truncate text-[13px] text-[var(--st-text-3,var(--text-popover))]">
                              {action.description}
                            </span>
                          )}
                        </span>
                      </a>
                    ))}

                    <div className="my-1 h-px bg-[var(--st-line,var(--gray-border))]" />

                    {AI_CONTEXT_ACTIONS.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        role="menuitem"
                        onClick={() => runQuickAction(action.message)}
                        className={cn(
                          "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-warm-black transition-colors hover:bg-[var(--st-hover,var(--gray-bg-hover))]",
                          action.label === "Custom site request" && "bg-[var(--st-need-tint,var(--gray-bg))]",
                        )}
                      >
                        <action.icon className={cn("h-5 w-5 shrink-0", action.label === "Custom site request" ? "text-warning" : "text-gray-fg")} strokeWidth={1.7} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium">{action.label}</span>
                          {action.description && (
                            <span className="mt-0.5 block truncate text-[13px] text-[var(--st-text-3,var(--text-popover))]">
                              {action.description}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}

                    <div className="my-1 h-px bg-[var(--st-line,var(--gray-border))]" />

                    {quickActions.map((action) => {
                      const Icon = action.icon ?? MessageSquareText;
                      return (
                        <button
                          key={action.label}
                          type="button"
                          role="menuitem"
                          onClick={() => runQuickAction(action.message)}
                          className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-warm-black transition-colors hover:bg-[var(--st-hover,var(--gray-bg-hover))]"
                        >
                          <Icon className="h-5 w-5 shrink-0 text-gray-fg" strokeWidth={1.7} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium">{action.label}</span>
                            {action.description && (
                              <span className="mt-0.5 block truncate text-[13px] text-[var(--st-text-3,var(--text-popover))]">
                                {action.description}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}

                    <div className="my-1 h-px bg-[var(--st-line,var(--gray-border))]" />

                    <div
                      className="relative"
                      onMouseEnter={() => setConnectionsOpen(true)}
                      onMouseLeave={() => setConnectionsOpen(false)}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => setConnectionsOpen((current) => !current)}
                        className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-warm-black transition-colors hover:bg-[var(--st-hover,var(--gray-bg-hover))]"
                        aria-haspopup="menu"
                        aria-expanded={connectionsOpen}
                      >
                        <Link2 className="h-5 w-5 shrink-0 text-gray-fg" strokeWidth={1.7} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium">Use a source</span>
                          <span className="mt-0.5 block truncate text-[13px] text-[var(--st-text-3,var(--text-popover))]">
                            Add source context to the prompt.
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--st-text-3,var(--text-popover))]" strokeWidth={1.8} />
                      </button>

                      {connectionsOpen && (
                        <div
                          role="menu"
                          className="absolute bottom-0 left-[calc(100%+0.5rem)] z-40 w-[min(calc(100vw-2rem),310px)] rounded-2xl border border-[var(--st-line,var(--gray-border))] bg-[var(--st-surface,var(--surface-popover))] text-[var(--st-text-2,var(--text-popover))] p-1.5 shadow-[var(--st-shadow-lg)] max-md:bottom-full max-md:left-0 max-md:mb-2"
                        >
                          {SOURCE_ACTIONS.map((action) => (
                            <button
                              key={action.label}
                              type="button"
                              role="menuitem"
                              onClick={() => insertSourcePrompt(action.message)}
                              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-warm-black transition-colors hover:bg-[var(--st-hover,var(--gray-bg-hover))]"
                            >
                              <action.icon className="h-[18px] w-[18px] shrink-0 text-gray-fg" strokeWidth={1.7} />
                              <span className="min-w-0 flex-1">
                                <span className="block text-[13px] font-medium">{action.label}</span>
                                {action.description && (
                                  <span className="mt-0.5 block truncate text-[13px] text-[var(--st-text-3,var(--text-popover))]">
                                    {action.description}
                                  </span>
                                )}
                              </span>
                            </button>
                          ))}
                          <div className="my-1 h-px bg-[var(--st-line,var(--gray-border))]" />
                          <a
                            href={actionHref("/dashboard/integrations")}
                            role="menuitem"
                            onClick={() => {
                              setActionsOpen(false);
                              setConnectionsOpen(false);
                            }}
                            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-warm-black transition-colors hover:bg-[var(--st-hover,var(--gray-bg-hover))]"
                          >
                            <Link2 className="h-[18px] w-[18px] shrink-0 text-gray-fg" strokeWidth={1.7} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-medium">Manage sources</span>
                              <span className="mt-0.5 block truncate text-[13px] text-[var(--st-text-3,var(--text-popover))]">
                                Open source settings.
                              </span>
                            </span>
                          </a>
                        </div>
                      )}
                    </div>
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
              onMouseEnter={openUsageSoon}
              onMouseLeave={closeUsage}
              onFocus={() => {
                setUsageOpen(true);
                fetchUsage();
              }}
              onBlur={closeUsage}
              className={cn(
                "relative flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--st-accent,var(--accent))]",
                thinkMode
                  ? "border-transparent bg-[var(--st-selected,var(--gray-bg))] text-warm-black"
                  : "border-transparent text-gray-muted hover:bg-[var(--st-hover,var(--gray-bg-hover))] hover:text-warm-black",
              )}
              aria-pressed={thinkMode}
              aria-describedby="ai-think-usage"
            >
              <BrainCog className="h-4 w-4" strokeWidth={1.5} />
              <span className={cn("overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-(--motion-base)", thinkMode ? "max-w-[64px] opacity-100" : "max-w-0 opacity-0")}>
                Think
              </span>
              {usageOpen && (
                <span
                  id="ai-think-usage"
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-0 z-40 mb-2 w-max max-w-[240px] rounded-lg bg-surface-tooltip px-2.5 py-1.5 text-left text-[13px] leading-relaxed text-text-tooltip"
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
              "flex h-9 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--st-accent,var(--accent))]",
              isLoading
                ? "bg-[var(--st-selected,var(--gray-bg))] text-warm-black"
                : hasContent
                  ? "bg-[var(--st-action,var(--warm-black))] text-[var(--st-on-action,var(--surface))] hover:bg-[var(--st-action-hover,var(--warm-black))]"
                  : "bg-[var(--st-inset,var(--gray-bg))] text-[var(--st-faint,var(--gray-subtle))]",
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
