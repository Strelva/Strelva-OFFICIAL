"use client";

import { Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

export interface TraceStep {
  id: string;
  type: "tool_call" | "reasoning" | "result";
  label: string;
  status: "pending" | "running" | "success" | "error";
  detail?: string;
  timestamp: number;
}

interface AgentTraceProps {
  steps: TraceStep[];
  isRunning?: boolean;
}

export function AgentTrace({ steps, isRunning }: AgentTraceProps) {
  const [expanded, setExpanded] = useState(true);

  if (steps.length === 0 && !isRunning) return null;

  return (
    <div className="border border-gray-border rounded-lg bg-surface-base overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-surface transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-muted" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-muted" />
        )}
        <span className="text-[11px] font-medium text-gray-muted">Agent Activity</span>
        {isRunning && (
          <Loader2 className="w-3 h-3 text-accent animate-spin ml-auto" />
        )}
        {!isRunning && steps.length > 0 && (
          <span className="text-[11px] text-gray-faint ml-auto">
            {steps.length} step{steps.length !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-border">
          {steps.map((step, i) => (
            <TraceStepRow key={step.id} step={step} isLast={i === steps.length - 1} />
          ))}
          {isRunning && steps.length === 0 && (
            <div className="px-3 py-4 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 text-accent animate-spin" />
              <span className="text-[11px] text-gray-muted">Thinking...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TraceStepRow({ step, isLast }: { step: TraceStep; isLast: boolean }) {
  const StatusIcon =
    step.status === "running"
      ? Loader2
      : step.status === "success"
        ? CheckCircle
        : step.status === "error"
          ? AlertCircle
          : null;

  const statusColor =
    step.status === "running"
      ? "text-accent"
      : step.status === "success"
        ? "text-green-600"
        : step.status === "error"
          ? "text-red-600"
          : "text-gray-faint";

  return (
    <div
      className={`px-3 py-2 flex items-start gap-2 ${!isLast ? "border-b border-gray-border" : ""}`}
    >
      <div className="w-4 h-4 flex items-center justify-center shrink-0 mt-0.5">
        {StatusIcon && (
          <StatusIcon
            className={`w-3.5 h-3.5 ${statusColor} ${step.status === "running" ? "animate-spin" : ""}`}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-warm-black">{step.label}</p>
        {step.detail && (
          <p className="text-[11px] text-gray-faint mt-0.5 truncate">{step.detail}</p>
        )}
      </div>
      <span className="text-[11px] text-gray-faint tabular-nums shrink-0">
        {formatTime(step.timestamp)}
      </span>
    </div>
  );
}

function formatTime(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}
