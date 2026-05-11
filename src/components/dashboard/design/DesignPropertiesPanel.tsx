"use client";

import { useState, useCallback, useRef } from "react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  Images,
  TrendingUp,
} from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { AgentTrace, type TraceStep } from "../AgentTrace";
import { AgentPreview } from "../AgentPreview";
import { AssetPickerModal } from "../AssetPickerModal";
import { useDashboardOptional } from "../DashboardContext";
import type { PreviewDiff, RiskAssessment } from "@/lib/agent-risk";
import type { SelectedNode } from "../DesignMode";

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
  sectionLayout?: { gap?: LayoutGap; padding?: LayoutPadding };
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
  sectionLayout,
  editMode = "draft",
  hasDraft = false,
  sectionAnalytics,
}: DesignPropertiesPanelProps) {
  const dashboard = useDashboardOptional();
  const dashboardHref = dashboard?.dashboardHref ?? ((path: string) => path);
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
      {analytics && (analytics.clicks || analytics.views) && (
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
      )}

      <div className="flex-1 overflow-y-auto">
        {!selectedNode ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[12px] text-gray-faint">Select a layer to edit</p>
          </div>
        ) : activeTab === "design" ? (
          <DesignTab node={selectedNode} onLayoutUpdate={onLayoutUpdate} sectionLayout={sectionLayout} />
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

function PropertyRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-1.5">
      <span className="text-[11px] text-gray-muted">{label}</span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

function NumberInput({
  value,
  unit,
  width = 56,
  onChange,
}: {
  value: number;
  unit?: string;
  width?: number;
  onChange?: (value: number) => void;
}) {
  const [localValue, setLocalValue] = useState(value.toString());

  const handleBlur = useCallback(() => {
    const num = parseFloat(localValue);
    if (!isNaN(num) && onChange) {
      onChange(num);
    }
  }, [localValue, onChange]);

  return (
    <div
      className="flex items-center bg-surface-base border border-gray-border rounded-md px-2 h-[26px] focus-within:border-accent/50"
      style={{ width }}
    >
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        className="w-full bg-transparent text-[11px] text-warm-black text-right outline-none tabular-nums"
      />
      {unit && (
        <span className="text-[10px] text-gray-faint ml-0.5">{unit}</span>
      )}
    </div>
  );
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-5 h-5 rounded-md border border-gray-border"
        style={{ backgroundColor: color }}
      />
      <span className="text-[11px] text-gray-muted font-mono">{color}</span>
    </div>
  );
}

function DesignTab({
  node,
  onLayoutUpdate,
  sectionLayout,
}: {
  node: SelectedNode;
  onLayoutUpdate?: (section: string, layout: { gap?: LayoutGap; padding?: LayoutPadding }) => void;
  sectionLayout?: { gap?: LayoutGap; padding?: LayoutPadding };
}) {
  const currentGap = sectionLayout?.gap || 'normal';
  const currentPadding = sectionLayout?.padding || 'normal';

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

  return (
    <div className="py-2">
      {node.type === "section" && (
        <>
          <SectionLabel>Section Layout</SectionLabel>
          <div className="px-4 py-3 space-y-3">
            <div>
              <span className="text-[10px] text-gray-faint mb-1.5 block">Gap</span>
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
              <span className="text-[10px] text-gray-faint mb-1.5 block">Padding</span>
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
        </>
      )}

      <SectionLabel>Layout</SectionLabel>
      <div className="px-4 py-3 space-y-2.5">
        <div className="flex items-center gap-1">
          {(["horizontal", "vertical", "none"] as const).map((dir) => (
            <button
              key={dir}
              className={`flex-1 h-[28px] rounded-md text-[10px] font-medium transition-colors ${
                node.layout === dir
                  ? "bg-accent/15 text-accent border border-accent/30"
                  : "bg-surface-base text-gray-muted border border-gray-border hover:border-gray-muted"
              }`}
            >
              {dir === "none" ? "Abs" : dir === "horizontal" ? "Row" : "Col"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {[AlignStartVertical, AlignCenterVertical, AlignEndVertical].map(
            (Icon, i) => (
              <button
                key={i}
                className="w-7 h-7 rounded-md flex items-center justify-center text-gray-faint hover:text-gray-muted hover:bg-surface-base border border-transparent hover:border-gray-border transition-colors"
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            )
          )}
          <div className="w-px h-4 bg-gray-border mx-1" />
          {[AlignLeft, AlignCenter, AlignRight].map((Icon, i) => (
            <button
              key={i}
              className="w-7 h-7 rounded-md flex items-center justify-center text-gray-faint hover:text-gray-muted hover:bg-surface-base border border-transparent hover:border-gray-border transition-colors"
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          ))}
        </div>
      </div>

      <SectionLabel>Size</SectionLabel>
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <span className="text-[10px] text-gray-faint mb-1 block">W</span>
            <NumberInput value={node.width} unit="px" width={80} />
          </div>
          <div className="flex-1">
            <span className="text-[10px] text-gray-faint mb-1 block">H</span>
            <NumberInput value={node.height} unit="px" width={80} />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1">
            <span className="text-[10px] text-gray-faint mb-1 block">X</span>
            <NumberInput value={node.x} width={80} />
          </div>
          <div className="flex-1">
            <span className="text-[10px] text-gray-faint mb-1 block">Y</span>
            <NumberInput value={node.y} width={80} />
          </div>
        </div>
      </div>

      <SectionLabel>Fill</SectionLabel>
      <div className="px-4 py-3">
        <ColorSwatch color={node.fill || "#transparent"} />
      </div>

      {node.layout !== "none" && (
        <>
          <SectionLabel>Spacing</SectionLabel>
          <div className="px-4 py-3 space-y-1.5">
            <PropertyRow label="Gap">
              <NumberInput value={node.gap || 0} unit="px" />
            </PropertyRow>
            <PropertyRow label="Padding">
              <NumberInput value={node.padding || 0} unit="px" />
            </PropertyRow>
          </div>
        </>
      )}

      <SectionLabel>Corner Radius</SectionLabel>
      <div className="px-4 py-3">
        <PropertyRow label="Radius">
          <NumberInput value={node.cornerRadius || 0} unit="px" />
        </PropertyRow>
      </div>

      <SectionLabel>Opacity</SectionLabel>
      <div className="px-4 py-3">
        <PropertyRow label="Opacity">
          <NumberInput value={(node.opacity ?? 1) * 100} unit="%" />
        </PropertyRow>
      </div>

      {node.type === "text" && (
        <>
          <SectionLabel>Typography</SectionLabel>
          <div className="px-4 py-3 space-y-1.5">
            <PropertyRow label="Font">
              <span className="text-[11px] text-gray-muted">
                {node.fontFamily || "Inter"}
              </span>
            </PropertyRow>
            <PropertyRow label="Size">
              <NumberInput value={node.fontSize || 16} unit="px" />
            </PropertyRow>
            <PropertyRow label="Weight">
              <span className="text-[11px] text-gray-muted">
                {node.fontWeight || "400"}
              </span>
            </PropertyRow>
          </div>
        </>
      )}
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
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);

  const handleSave = useCallback(async () => {
    if (!node.sectionType || !onContentUpdate) return;

    setIsSaving(true);
    try {
      await onContentUpdate(
        node.sectionType,
        node.field || "content",
        localContent
      );
    } finally {
      setIsSaving(false);
    }
  }, [node.sectionType, node.field, localContent, onContentUpdate]);

  const handleImageSelect = useCallback(async (url: string) => {
    if (!node.sectionType || !onContentUpdate) return;

    // For images, we update the imageUrl or backgroundImageUrl field
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
              <span className="text-[10px] text-gray-faint">Text</span>
              {hasDraft && (
                <span className="text-[9px] text-amber-500 font-medium">Draft</span>
              )}
            </div>
            <textarea
              value={localContent}
              onChange={(e) => setLocalContent(e.target.value)}
              rows={3}
              className="w-full bg-surface-base border border-gray-border rounded-lg px-3 py-2 text-[12px] text-warm-black outline-none resize-none focus:border-accent/50 transition-colors"
            />
            {onContentUpdate && node.sectionType && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="mt-2 w-full h-[32px] rounded-lg bg-accent text-white text-[12px] font-medium hover:bg-accent/80 transition-colors disabled:opacity-50"
              >
                {isSaving ? "Saving..." : editMode === "draft" ? "Save Draft" : "Publish"}
              </button>
            )}
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
            <p className="text-[10px] text-gray-faint">
              Click on text elements in the canvas to edit them directly, or use the AI tab to make changes.
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-gray-faint">
            Select a text or image layer to edit content.
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

      {node.sectionType && (
        <>
          <SectionLabel>Section Info</SectionLabel>
          <div className="px-4 py-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-faint">Type</span>
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

function AITab({
  node,
  onContentUpdate,
}: {
  node: SelectedNode;
  onContentUpdate?: (section: string, field: string, value: string) => void;
}) {
  const dashboard = useDashboardOptional();
  const dashboardHref = dashboard?.dashboardHref ?? ((path: string) => path);
  const [prompt, setPrompt] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [response, setResponse] = useState<{ type: "success" | "error"; message: string } | null>(null);
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

  const executeAgentPrompt = useCallback(async (userPrompt: string) => {
    if (!userPrompt.trim() || !node.sectionType) return;

    setIsApplying(true);
    setResponse(null);
    setTraceSteps([]);
    setPendingPreview(null);

    try {
      // Build context-aware prompt
      const contextualPrompt = `I'm looking at the ${node.label} section (${node.sectionType}). ${userPrompt}`;

      // Build node context for enhanced agent awareness
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

      // Stream the response
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullText = "";
      let currentStepId: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("__TOOL__")) {
            // Mark previous step as complete
            if (currentStepId) {
              updateTraceStep(currentStepId, "success");
            }
            const label = line.replace("__TOOL__", "");
            currentStepId = addTraceStep(label);
          } else if (line.startsWith("__RESULT__")) {
            // Final agent contract is consumed by ChatPanel; design trace only needs text/tool steps.
            continue;
          } else {
            fullText += line;
          }
        }
      }

      // Mark final step as complete
      if (currentStepId) {
        updateTraceStep(currentStepId, "success");
      }

      setResponse({ type: "success", message: fullText.trim() || "Done." });

      // Trigger content refresh if we have a callback
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
      setPrompt("");
    }
  }, [dashboardHref, node.sectionType, node.label, node.field, node.content, onContentUpdate, addTraceStep, updateTraceStep]);

  const handleApply = useCallback(() => {
    executeAgentPrompt(prompt);
  }, [prompt, executeAgentPrompt]);

  const handleQuickAction = useCallback((actionPrompt: string) => {
    executeAgentPrompt(actionPrompt);
  }, [executeAgentPrompt]);

  const handlePreviewApprove = useCallback(() => {
    if (!pendingPreview) return;
    // TODO: Apply the changes via API
    setPendingPreview(null);
    setResponse({ type: "success", message: "Changes applied." });
  }, [pendingPreview]);

  const handlePreviewReject = useCallback(() => {
    setPendingPreview(null);
    setResponse({ type: "error", message: "Changes cancelled." });
  }, []);

  const quickActions = [
    { label: "Rewrite copy", prompt: "Rewrite the copy to be more compelling and engaging" },
    { label: "Shorten", prompt: "Make the content more concise while keeping the key message" },
    { label: "Add emphasis", prompt: "Add more emphasis and urgency to the messaging" },
    { label: "Fix grammar", prompt: "Fix any grammar or spelling issues" },
  ];

  // Show preview if pending
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
      <SectionLabel>AI Edit</SectionLabel>
      <div className="px-4 py-3">
        <p className="text-[11px] text-gray-muted mb-3">
          Describe changes for{" "}
          <span className="text-accent font-medium">{node.label}</span>
          {node.field && (
            <span className="text-gray-faint"> ({node.field})</span>
          )}
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={`e.g. "Make the headline punchier" or "Add a second paragraph about pricing"`}
          rows={4}
          disabled={isApplying}
          className="w-full bg-surface-base border border-gray-border rounded-lg px-3 py-2 text-[12px] text-warm-black outline-none resize-none placeholder:text-gray-faint focus:border-accent/50 transition-colors disabled:opacity-50"
        />
        <button
          onClick={handleApply}
          disabled={isApplying || !prompt.trim()}
          className="mt-2 w-full h-[32px] rounded-lg bg-accent text-white text-[12px] font-medium hover:bg-accent/80 transition-colors disabled:opacity-50"
        >
          {isApplying ? "Working..." : "Apply with AI"}
        </button>
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
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {response.message.slice(0, 300)}
            {response.message.length > 300 && "..."}
          </div>
        </div>
      )}

      <SectionLabel>Quick Actions</SectionLabel>
      <div className="px-4 py-3 flex flex-wrap gap-1.5">
        {quickActions.map((action) => (
          <button
            key={action.label}
            onClick={() => handleQuickAction(action.prompt)}
            disabled={isApplying}
            className="px-2.5 py-1 rounded-md bg-surface-base border border-gray-border text-[10px] text-gray-muted hover:text-warm-black hover:border-gray-muted transition-colors disabled:opacity-50"
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
