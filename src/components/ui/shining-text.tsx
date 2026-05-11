"use client";

interface ShiningTextProps {
  text: string;
  className?: string;
}

export function ShiningText({ text, className = "" }: ShiningTextProps) {
  return (
    <span className={`ai-shining-text ${className}`}>
      {text}
    </span>
  );
}
