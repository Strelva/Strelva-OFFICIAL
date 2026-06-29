"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Images,
  TrendingUp,
  Check,
  Loader2,
} from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { AgentTrace, type TraceStep } from "../AgentTrace";
import { AgentPreview } from "../AgentPreview";
import { AssetPickerModal } from "../AssetPickerModal";
import { useDashboardOptional } from "../DashboardContext";
import type { PreviewDiff, RiskAssessment } from "@/lib/agent-risk";
import type { SectionCapability } from "@/lib/types";
import type { SelectedNode } from "../DesignMode";

const isMac = typeof navigator !== "undefined" && (/Mac/i.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? "") || /Mac/i.test(navigator.platform ?? ""));

type LayoutGap = 'tight' | 'normal' | 'loose';
type LayoutPadding = 'none' | 'normal' | 'spacious';

interface SectionAnalytics {
  clicks?: number;
  views?: number;
  trend?: "up" | "down" | "flat";
}

interface DesignPropertiesPanelProps {
  selectedNode: SelectedNode | null;
  activeTab: "design" | "content" | "ai";
  onTabChange: (tab: "design" | "content" | "ai") => void;
  onContentUpdate?: (section: string, field: string, value: string) => void;
  onLayoutUpdate?: (section: string, layout: { gap?: LayoutGap; padding?: LayoutPadding }) => void;
  onVariantUpdate?: (section: string, variant: string) => void;
  sectionLayout?: { gap?: LayoutGap; padding?: LayoutPadding };
  sectionVariant?: string;
  sectionCapability?: SectionCapability;
  editMode?: "live" | "draft";
  hasDraft?: boolean;
  sectionAnalytics?: Record<string, SectionAnalytics>;
}

export function DesignPropertiesPanel({
  selectedNode,
  activeTab,
  onTabChange,
  onContentUpdate,
  onLayoutUpdate,
  onVariantUpdate,
  sectionLayout,
  sectionVariant,
  sectionCapability,
  editMode = "draft",
  hasDraft = false,
  sectionAnalytics,
}: DesignPropertiesPanelProps) {
  const analytics = selectedNode?.sectionType
    ? sectionAnalytics?.[selectedNode.sectionType]
    : undefined;
  return (
    <aside className="w-[280px] shrink-0 border-l border-gray-border flex flex-col bg-surface">
      <div className="h-10 border-b border-gray-border shrink-0 flex items-center">
        <Tabs
          variant="underline"
          items={[
            { value: "design", label: "Design" },
            { value: "content", label: "Content" },
            { value: "ai", label: "AI" },
          ]}
          value={activeTab}
          onChange={(v) => onTabChange(v as "design" | "content" | "ai")}
          className="h-full"
        />
      </div>

      {/* Analytics indicator */}
      {analytics && (analytics.clicks || analytics.views) ? (
        <div className="px-4 py-2 border-b border-gray-border bg-accent/5">
          <div className="flex items-center gap-2">
            <TrendingUp
              className={`w-3.5 h-3.5 ${
                analytics.trend === "up"
                  ? "text-success"
                  : analytics.trend === "down"
                  ? "text-red-400"
                  : "text-gray-muted"
              }`}
              strokeWidth={1.5}
            />
            <span className="text-[11px] text-gray-fg">
              {analytics.clicks
                ? `${analytics.clicks} click${analytics.clicks === 1 ? "" : "s"} this week`
                : analytics.views
                ? `${analytics.views} view${analytics.views === 1 ? "" : "s"} this week`
                : null}
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto">
        {!selectedNode ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-6">
            <p className="text-[12px] text-gray-faint text-center">Select a section in the layers panel or click on the canvas</p>
          </div>
        ) : activeTab === "design" ? (
          <DesignTab
            node={selectedNode}
            onLayoutUpdate={onLayoutUpdate}
            onVariantUpdate={onVariantUpdate}
            sectionLayout={sectionLayout}
            sectionVariant={sectionVariant}
            sectionCapability={sectionCapability}
          />
        ) : activeTab === "content" ? (
          <ContentTab
            node={selectedNode}
            onContentUpdate={onContentUpdate}
            editMode={editMode}
            hasDraft={hasDraft}
          />
        ) : (
          <AITab node={selectedNode} onContentUpdate={onContentUpdate} />
        )}
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-2 border-b border-gray-border">
      <span className="text-[10px] font-medium text-gray-faint uppercase tracking-wider">
        {children}
      </span>
    </div>
  );
}

function DesignTab({
  node,
  onLayoutUpdate,
  onVariantUpdate,
  sectionLayout,
  sectionVariant,
  sectionCapability,
}: {
  node: SelectedNode;
  onLayoutUpdate?: (section: string, layout: { gap?: LayoutGap; padding?: LayoutPadding }) => void;
  onVariantUpdate?: (section: string, variant: string) => void;
  sectionLayout?: { gap?: LayoutGap; padding?: LayoutPadding };
  sectionVariant?: string;
  sectionCapability?: SectionCapability;
}) {
  const currentGap = sectionLayout?.gap || 'normal';
  const currentPadding = sectionLayout?.padding || 'normal';
  const variants = sectionCapability?.variants?.length ? sectionCapability.variants : ["default"];
  const currentVariant = sectionVariant || "default";

  const handleGapChange = (gap: LayoutGap) => {
    if (onLayoutUpdate && node.sectionType) {
      onLayoutUpdate(node.sectionType, { gap, padding: currentPadding });
    }
  };

  const handlePaddingChange = (padding: LayoutPadding) => {
    if (onLayoutUpdate && node.sectionType) {
      onLayoutUpdate(node.sectionType, { gap: currentGap, padding });
    }
  };

  if (node.type !== "section") {
    return (
      <div className="flex items-center justify-center h-32 px-6">
        <p className="text-[11px] text-gray-faint text-center">
          Design controls are available for sections. Select a section in the layers panel.
        </p>
      </div>
    );
  }

  return (
    <div className="py-2">
      <SectionLabel>Section Variant</SectionLabel>
      <div className="px-4 py-3">
        <select
          value={currentVariant}
          onChange={(event) => {
            if (node.sectionType && onVariantUpdate) {
              onVariantUpdate(node.sectionType, event.target.value);
            }
          }}
          className="h-8 w-full rounded-md border border-gray-border bg-surface-base px-2 text-[11px] text-warm-black outline-none focus:border-accent/50"
        >
          {variants.map((variant) => (
            <option key={variant} value={variant}>
              {variant.charAt(0).toUpperCase() + variant.slice(1)}
            </option>
          ))}
        </select>
        {variants.length <= 1 && (
          <p className="mt-2 text-[10px] leading-4 text-gray-faint">
            This section has one variant. Custom sites can define more via the capability manifest.
          </p>
        )}
      </div>

      <SectionLabel>Spacing</SectionLabel>
      <div className="px-4 py-3 space-y-3">
        <div>
          <span className="text-[10px] text-gray-faint mb-1.5 block">Gap between elements</span>
          <div className="flex items-center gap-1">
            {(['tight', 'normal', 'loose'] as const).map((gap) => (
              <button
                key={gap}
                onClick={() => handleGapChange(gap)}
                className={`flex-1 h-[28px] rounded-md text-[10px] font-medium transition-colors ${
                  currentGap === gap
                    ? "bg-accent/15 text-accent border border-accent/30"
                    : "bg-surface-base text-gray-muted border border-gray-border hover:border-gray-muted"
                }`}
              >
                {gap.charAt(0).toUpperCase() + gap.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="text-[10px] text-gray-faint mb-1.5 block">Section padding</span>
          <div className="flex items-center gap-1">
            {(['none', 'normal', 'spacious'] as const).map((padding) => (
              <button
                key={padding}
                onClick={() => handlePaddingChange(padding)}
                className={`flex-1 h-[28px] rounded-md text-[10px] font-medium transition-colors ${
                  currentPadding === padding
                    ? "bg-accent/15 text-accent border border-accent/30"
                    : "bg-surface-base text-gray-muted border border-gray-border hover:border-gray-muted"
                }`}
              >
                {padding.charAt(0).toUpperCase() + padding.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <SectionLabel>Section Info</SectionLabel>
      <div className="px-4 py-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-faint">Type</span>
          <span className="text-[11px] text-gray-muted font-mono">{node.sectionType}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-faint">Variant</span>
          <span className="text-[11px] text-gray-muted font-mono">{currentVariant}</span>
        </div>
      </div>
    </div>
  );
}

function ContentTab({
  node,
  onContentUpdate,
  editMode,
  hasDraft,
}: {
  node: SelectedNode;
  onContentUpdate?: (section: string, field: string, value: string) => void;
  editMode?: "live" | "draft";
  hasDraft?: boolean;
}) {
  const [localContent, setLocalContent] = useState(node.content || node.label);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Clean up save timer on unmount
  useEffect(() => {
    return () => clearTimeout(saveTimerRef.current);
  }, []);

  // Reset local content when node changes
  useEffect(() => {
    setLocalContent(node.content || node.label);
    setSaveStatus("idle");
  }, [node.id, node.content, node.label]);

  const handleSave = useCallback(async () => {
    if (!node.sectionType || !onContentUpdate) return;

    setIsSaving(true);
    setSaveStatus("idle");
    try {
      await onContentUpdate(
        node.sectionType,
        node.field || "content",
        localContent
      );
      setSaveStatus("saved");
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
    } finally {
      setIsSaving(false);
    }
  }, [node.sectionType, node.field, localContent, onContentUpdate]);

  const handleImageSelect = useCallback(async (url: string) => {
    if (!node.sectionType || !onContentUpdate) return;

    const imageField = node.field || "imageUrl";
    await onContentUpdate(node.sectionType, imageField, url);
  }, [node.sectionType, node.field, onContentUpdate]);

  return (
    <div className="py-2">
      <SectionLabel>Content</SectionLabel>
      <div className="px-4 py-3">
        {node.type === "text" || node.type === "button" ? (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-gray-faint">
                {node.field || "Text"}
              </span>
              <div className="flex items-center gap-1.5">
                {hasDraft && (
                  <span className="text-[9px] text-amber-500 font-medium px-1.5 py-0.5 rounded bg-amber-400/10">Draft</span>
                )}
                {saveStatus === "saved" && (
                  <span className="text-[9px] text-emerald-500 font-medium flex items-center gap-0.5">
                    <Check className="w-3 h-3" strokeWidth={2} />
                    Saved
                  </span>
                )}
                {saveStatus === "error" && (
                  <span className="text-[9px] text-red-400 font-medium">Save failed</span>
                )}
              </div>
            </div>
            <textarea
              value={localContent}
              onChange={(e) => setLocalContent(e.target.value)}
              rows={4}
              className="w-full bg-surface-base border border-gray-border rounded-lg px-3 py-2 text-[12px] text-warm-black outline-none resize-y focus:border-accent/50 transition-colors"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleSave();
                }
              }}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[9px] text-gray-faint">
                {isMac ? "Cmd" : "Ctrl"}+Enter to save
              </span>
              {onContentUpdate && node.sectionType && (
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="h-[28px] px-3 rounded-lg bg-accent text-on-accent text-[11px] font-medium hover:bg-accent/80 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
                      Saving
                    </>
                  ) : editMode === "draft" ? "Save Draft" : "Publish"}
                </button>
              )}
            </div>
          </div>
        ) : node.type === "image" ? (
          <div>
            <span className="text-[10px] text-gray-faint mb-1.5 block">
              Image
            </span>
            <button
              onClick={() => setAssetPickerOpen(true)}
              className="w-full h-24 bg-surface-base border border-dashed border-gray-border rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-sage hover:bg-sage/5 transition-colors"
            >
              <Images className="w-5 h-5 text-gray-muted mb-1.5" strokeWidth={1.5} />
              <span className="text-[11px] text-gray-muted font-medium">
                Replace from Assets
              </span>
              <span className="text-[10px] text-gray-faint mt-0.5">
                Choose from your photo library
              </span>
            </button>
            <AssetPickerModal
              open={assetPickerOpen}
              onClose={() => setAssetPickerOpen(false)}
              onSelect={handleImageSelect}
            />
          </div>
        ) : node.type === "section" ? (
          <div>
            <p className="text-[11px] text-gray-muted mb-3">
              Editing section: <span className="text-accent font-medium">{node.label}</span>
            </p>
            <p className="text-[10px] text-gray-faint leading-relaxed">
              Click on text elements in the canvas to edit them directly, or switch to the AI tab for AI-powered changes.
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-gray-faint">
            Select a text or image element to edit content.
          </p>
        )}
      </div>

      {node.type === "button" && (
        <>
          <SectionLabel>Link</SectionLabel>
          <div className="px-4 py-3">
            <input
              type="text"
              placeholder="https://"
              className="w-full bg-surface-base border border-gray-border rounded-md px-3 py-1.5 text-[11px] text-warm-black outline-none focus:border-accent/50 transition-colors"
            />
          </div>
        </>
      )}

      {node.sectionType && node.type !== "section" && (
        <>
          <SectionLabel>Element Info</SectionLabel>
          <div className="px-4 py-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-faint">Section</span>
              <span className="text-[11px] text-gray-muted font-mono">{node.sectionType}</span>
            </div>
            {node.field && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-faint">Field</span>
                <span className="text-[11px] text-gray-muted font-mono">{node.field}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Contextual quick actions based on section type
function getQuickActions(sectionType?: string): { label: string; prompt: string }[] {
  const common = [
    { label: "Rewrite copy", prompt: "Rewrite the copy to be more compelling and engaging" },
    { label: "Shorten", prompt: "Make the content more concise while keeping the key message" },
    { label: "Fix grammar", prompt: "Fix any grammar or spelling issues" },
  ];

  switch (sectionType) {
    case "hero":
      return [
        { label: "Better headline", prompt: "Suggest a more compelling headline that grabs attention" },
        { label: "Stronger CTA", prompt: "Make the call-to-action button text more action-oriented" },
        ...common,
      ];
    case "services":
      return [
        { label: "Add benefits", prompt: "Emphasize the benefits of each service, not just features" },
        { label: "Add social proof", prompt: "Weave in credibility signals like experience, certifications, or number of clients" },
        ...common,
      ];
    case "testimonials":
      return [
        { label: "Highlight results", prompt: "Emphasize the outcomes and results mentioned in testimonials" },
        ...common,
      ];
    case "story":
      return [
        { label: "More personal", prompt: "Make the about section more personal and relatable" },
        { label: "Add credentials", prompt: "Highlight qualifications, experience, and what makes this business unique" },
        ...common,
      ];
    case "contact":
      return [
        { label: "Add urgency", prompt: "Add a sense of urgency or reason to reach out now" },
        ...common,
      ];
    case "faq":
      return [
        { label: "Suggest questions", prompt: "Suggest 2-3 additional FAQ questions that potential customers commonly ask" },
        ...common,
      ];
    case "page-cta":
      return [
        { label: "Stronger CTA", prompt: "Make the call-to-action more compelling with urgency and clear value" },
        { label: "A/B variant", prompt: "Write an alternative version of this CTA section for A/B testing" },
        ...common,
      ];
    default:
      return [
        { label: "Add emphasis", prompt: "Add more emphasis and urgency to the messaging" },
        ...common,
      ];
  }
}

function AITab({
  node,
  onContentUpdate,
}: {
  node: SelectedNode;
  onContentUpdate?: (section: string, field: string, value: string) => void;
}) {
  const dashboard = useDashboardOptional();
  const dashboardHref = useCallback(
    (path: string) => dashboard?.dashboardHref(path) ?? path,
    [dashboard],
  );
  const [prompt, setPrompt] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [response, setResponse] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [traceSteps, setTraceSteps] = useState<TraceStep[]>([]);
  const [pendingPreview, setPendingPreview] = useState<{
    section: string;
    diffs: PreviewDiff[];
    risk: RiskAssessment;
  } | null>(null);
  const stepIdCounter = useRef(0);

  const addTraceStep = useCallback((label: string, type: TraceStep["type"] = "tool_call"): string => {
    const id = `step_${++stepIdCounter.current}`;
    setTraceSteps((prev) => [
      ...prev,
      { id, type, label, status: "running", timestamp: Date.now() },
    ]);
    return id;
  }, []);

  const updateTraceStep = useCallback((id: string, status: TraceStep["status"], detail?: string) => {
    setTraceSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status, detail } : s))
    );
  }, []);

  const executeAgentPrompt = useCallback(async (userPrompt: string, actionLabel?: string) => {
    if (!userPrompt.trim() || !node.sectionType) return;

    setIsApplying(true);
    setActiveAction(actionLabel || null);
    setResponse(null);
    setTraceSteps([]);
    setPendingPreview(null);

    try {
      const contextualPrompt = `I'm looking at the ${node.label} section (${node.sectionType}). ${userPrompt}`;

      const nodeContext = {
        selectedSection: node.sectionType,
        selectedField: node.field,
        currentValue: node.content || node.label,
      };

      const res = await fetch(dashboardHref("/api/agent"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: contextualPrompt }],
          activeSection: node.sectionType,
          nodeContext,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed: ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let currentStepId: string | null = null;

      const handleLine = (line: string) => {
        if (line.startsWith("__TOOL__")) {
          if (currentStepId) {
            updateTraceStep(currentStepId, "success");
          }
          const label = line.replace("__TOOL__", "");
          currentStepId = addTraceStep(label);
        } else if (line.startsWith("__RESULT__") || line.startsWith("__CARD__")) {
          // Inline cards are a chat-only concern; don't dump them into design text.
          return;
        } else {
          // Preserve newlines — the old `+= line` ran every paragraph together.
          fullText += line + "\n";
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Buffer across chunks: a marker or line split on a network boundary
        // used to be silently dropped. Only process complete lines; keep the
        // trailing partial for the next read.
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handleLine(line);
      }

      // Flush a final line that arrived without a trailing newline.
      if (buffer) handleLine(buffer);

      if (currentStepId) {
        updateTraceStep(currentStepId, "success");
      }

      setResponse({ type: "success", message: fullText.trim() || "Done." });

      if (onContentUpdate && node.sectionType) {
        window.dispatchEvent(new CustomEvent("reb-content-refresh", { detail: { section: node.sectionType } }));
      }
    } catch (err) {
      setResponse({
        type: "error",
        message: err instanceof Error ? err.message : "Something went wrong",
      });
    } finally {
      setIsApplying(false);
      setActiveAction(null);
      setPrompt("");
    }
  }, [dashboardHref, node.sectionType, node.label, node.field, node.content, onContentUpdate, addTraceStep, updateTraceStep]);

  const handleApply = useCallback(() => {
    executeAgentPrompt(prompt);
  }, [prompt, executeAgentPrompt]);

  const handleQuickAction = useCallback((action: { label: string; prompt: string }) => {
    executeAgentPrompt(action.prompt, action.label);
  }, [executeAgentPrompt]);

  const handlePreviewApprove = useCallback(() => {
    if (!pendingPreview) return;
    // Not yet wired to content pipeline -- clear state and inform user
    setPendingPreview(null);
    setResponse({ type: "info", message: "Preview approval coming soon. Changes were not saved." });
  }, [pendingPreview]);

  const handlePreviewReject = useCallback(() => {
    setPendingPreview(null);
    setResponse({ type: "error", message: "Changes cancelled." });
  }, []);

  const quickActions = getQuickActions(node.sectionType);

  if (pendingPreview) {
    return (
      <div className="py-2 px-3">
        <AgentPreview
          section={pendingPreview.section}
          diffs={pendingPreview.diffs}
          risk={pendingPreview.risk}
          onApprove={handlePreviewApprove}
          onReject={handlePreviewReject}
          isApplying={isApplying}
        />
      </div>
    );
  }

  return (
    <div className="py-2">
      <SectionLabel>Quick Actions</SectionLabel>
      <div className="px-4 py-3 flex flex-wrap gap-1.5">
        {quickActions.map((action) => (
          <button
            key={action.label}
            onClick={() => handleQuickAction(action)}
            disabled={isApplying}
            className={`px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-colors disabled:opacity-50 ${
              activeAction === action.label
                ? "bg-accent/15 text-accent border border-accent/30"
                : "bg-surface-base border border-gray-border text-gray-muted hover:text-warm-black hover:border-gray-muted"
            }`}
          >
            {activeAction === action.label ? (
              <span className="flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
                {action.label}
              </span>
            ) : (
              action.label
            )}
          </button>
        ))}
      </div>

      {/* Agent Trace */}
      {(traceSteps.length > 0 || isApplying) && (
        <div className="px-4 pb-3">
          <AgentTrace steps={traceSteps} isRunning={isApplying} />
        </div>
      )}

      {response && (
        <div className="px-4 pb-3">
          <div
            className={`p-3 rounded-lg text-[11px] leading-relaxed ${
              response.type === "success"
                ? "bg-emerald-950/30 text-emerald-300 border border-emerald-800/50"
                : response.type === "info"
                  ? "bg-sky-950/30 text-sky-300 border border-sky-800/50"
                  : "bg-red-950/30 text-red-300 border border-red-800/50"
            }`}
          >
            {response.message.slice(0, 300)}
            {response.message.length > 300 && "..."}
          </div>
        </div>
      )}

      <SectionLabel>Custom Prompt</SectionLabel>
      <div className="px-4 py-3">
        <p className="text-[11px] text-gray-muted mb-2">
          Describe changes for{" "}
          <span className="text-accent font-medium">{node.label}</span>
          {node.field && (
            <span className="text-gray-faint"> ({node.field})</span>
          )}
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={`e.g. "Make the headline punchier" or "Add a paragraph about pricing"`}
          rows={3}
          disabled={isApplying}
          className="w-full bg-surface-base border border-gray-border rounded-lg px-3 py-2 text-[12px] text-warm-black outline-none resize-none placeholder:text-gray-faint focus:border-accent/50 transition-colors disabled:opacity-50"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && prompt.trim()) {
              e.preventDefault();
              handleApply();
            }
          }}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[9px] text-gray-faint">
            {isMac ? "Cmd" : "Ctrl"}+Enter
          </span>
          <button
            onClick={handleApply}
            disabled={isApplying || !prompt.trim()}
            className="h-[28px] px-3 rounded-lg bg-accent text-on-accent text-[11px] font-medium hover:bg-accent/80 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isApplying ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
                Working
              </>
            ) : "Apply with AI"}
          </button>
        </div>
      </div>
    </div>
  );
}
