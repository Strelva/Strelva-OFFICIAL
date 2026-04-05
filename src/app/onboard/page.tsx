"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type ChatStep = "name" | "description" | "contact" | "generating" | "preview";

interface Message {
  from: "reb" | "user";
  text: string;
}

interface BusinessInfo {
  businessName: string;
  description: string;
  location: string;
  email: string;
}

interface GeneratedResult {
  content: Record<string, unknown>;
  template: string;
  subdomain: string;
}

function parseContactInfo(input: string): { location: string; email: string } {
  const emailMatch = input.match(/[\w.+-]+@[\w.-]+\.\w+/);
  const email = emailMatch ? emailMatch[0] : "";
  const location = input.replace(emailMatch?.[0] ?? "", "").replace(/[—\-,]\s*$/, "").trim();
  return { location, email };
}

export default function OnboardPage() {
  return (
    <Suspense>
      <OnboardChat />
    </Suspense>
  );
}

function OnboardChat() {
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref") || "";
  const [step, setStep] = useState<ChatStep>("name");
  const [messages, setMessages] = useState<Message[]>([
    { from: "reb", text: ref ? `Hey! ${ref} sent you. What's your business called?` : "What's your business called?" },
  ]);
  const [input, setInput] = useState("");
  const [info, setInfo] = useState<BusinessInfo>({
    businessName: "",
    description: "",
    location: "",
    email: "",
  });
  const [generated, setGenerated] = useState<GeneratedResult | null>(null);
  const [subdomain, setSubdomain] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, step]);

  useEffect(() => {
    if (step !== "generating" && step !== "preview") {
      inputRef.current?.focus();
    }
  }, [step]);

  function addMessages(...msgs: Message[]) {
    setMessages((prev) => [...prev, ...msgs]);
  }

  function handleSend() {
    const value = input.trim();
    if (!value) return;
    setInput("");

    if (step === "name") {
      const name = value;
      setInfo((prev) => ({ ...prev, businessName: name }));
      setSubdomain(
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
      );
      addMessages(
        { from: "user", text: value },
        { from: "reb", text: `Tell me about ${name}. What do you do?` }
      );
      setStep("description");
    } else if (step === "description") {
      setInfo((prev) => ({ ...prev, description: value }));
      addMessages(
        { from: "user", text: value },
        {
          from: "reb",
          text: "Where are you located? And what's the best email for customers?",
        }
      );
      setStep("contact");
    } else if (step === "contact") {
      const { location, email } = parseContactInfo(value);
      const updatedInfo = {
        ...info,
        description: info.description || messages.find((m) => m.from === "user" && messages.indexOf(m) === 2)?.text || "",
        location,
        email,
      };
      setInfo(updatedInfo);
      addMessages(
        { from: "user", text: value },
        { from: "reb", text: `Got it. Building ${info.businessName}'s website...` }
      );
      setStep("generating");
      generate(updatedInfo);
    }
  }

  async function generate(data: BusinessInfo) {
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/onboard/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: data.businessName,
          description: data.description,
          location: data.location,
          email: data.email || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(typeof d.error === "string" ? d.error : "Generation failed");
      }

      const d = await res.json();
      setGenerated(d);
      setSubdomain(d.subdomain);
      addMessages({
        from: "reb",
        text: `Here's what I built for ${data.businessName}.`,
      });
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      addMessages({ from: "reb", text: "Something went wrong. Let's try again. What's your business called?" });
      setStep("name");
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete() {
    if (!generated) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/onboard/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: info.businessName,
          ownerName: info.businessName,
          ownerEmail: info.email,
          industry: info.description,
          subdomain,
          template: generated.template,
          content: generated.content,
          referredBy: ref || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(typeof d.error === "string" ? d.error : "Setup failed");
      }

      const data = await res.json();

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else if (data.dashboardUrl) {
        window.location.href = data.dashboardUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-dvh" style={{ background: "#08080a" }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 pt-12 pb-4">
        <div className="mx-auto max-w-xl space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}
              style={{
                animation: "chatFadeIn 0.25s ease-out both",
                animationDelay: `${i * 0.05}s`,
              }}
            >
              <div className={msg.from === "user" ? "max-w-[80%]" : "max-w-[85%]"}>
                {msg.from === "reb" && (
                  <span
                    className="block text-xs font-medium mb-1 tracking-wide"
                    style={{ color: "#d4a052" }}
                  >
                    REB
                  </span>
                )}
                <div
                  className="rounded-xl px-4 py-2.5 text-[15px] leading-relaxed"
                  style={
                    msg.from === "user"
                      ? { background: "#1c1c20", color: "#e8e8ec" }
                      : { color: "#8e8e96" }
                  }
                >
                  {msg.text}
                </div>
              </div>
            </div>
          ))}

          {/* Generating spinner */}
          {step === "generating" && (
            <div className="flex justify-start" style={{ animation: "chatFadeIn 0.25s ease-out both" }}>
              <div>
                <span className="block text-xs font-medium mb-1 tracking-wide" style={{ color: "#d4a052" }}>
                  REB
                </span>
                <div className="flex items-center gap-2 px-4 py-2.5" style={{ color: "#8e8e96" }}>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray="60"
                      strokeDashoffset="20"
                    />
                  </svg>
                  <span className="text-[15px]">Writing content, picking a layout...</span>
                </div>
              </div>
            </div>
          )}

          {/* Preview cards + launch */}
          {step === "preview" && generated && (
            <div className="space-y-4" style={{ animation: "chatFadeIn 0.3s ease-out both" }}>
              <div className="space-y-3">
                <PreviewCard
                  title="Homepage"
                  content={generated.content.hero as Record<string, unknown>}
                  fields={["headline", "subheadline", "tagline"]}
                />
                <PreviewCard
                  title="About"
                  content={generated.content.story as Record<string, unknown>}
                  fields={["headline", "statement"]}
                />
                <PreviewCard
                  title="Services"
                  content={generated.content.services as Record<string, unknown>}
                  fields={["headline", "description"]}
                  listField="services"
                  listLabel="name"
                />
                <PreviewCard
                  title="FAQ"
                  content={generated.content.faq as Record<string, unknown>}
                  fields={["headline"]}
                  listField="faqs"
                  listLabel="question"
                />
              </div>

              {/* Subdomain picker */}
              <div className="rounded-xl p-4" style={{ background: "#0f0f12", border: "1px solid #1c1c20" }}>
                <label className="block text-xs font-medium mb-2" style={{ color: "#8e8e96" }}>
                  Your site URL
                </label>
                <div className="flex items-center">
                  <input
                    type="text"
                    value={subdomain}
                    onChange={(e) =>
                      setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                    }
                    className="flex-1 px-3 py-2 rounded-l-lg text-sm outline-none"
                    style={{
                      background: "#08080a",
                      color: "#e8e8ec",
                      border: "1px solid #26262b",
                      borderRight: "none",
                    }}
                  />
                  <span
                    className="px-3 py-2 rounded-r-lg text-sm"
                    style={{
                      background: "#0f0f12",
                      color: "#55555c",
                      border: "1px solid #26262b",
                    }}
                  >
                    .reb.studio
                  </span>
                </div>
              </div>

              {error && (
                <div
                  className="rounded-lg px-4 py-2.5 text-sm"
                  style={{ background: "rgba(220, 38, 38, 0.1)", color: "#f87171" }}
                >
                  {error}
                </div>
              )}

              <button
                onClick={handleComplete}
                disabled={loading || !subdomain}
                className="w-full py-3 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
                style={{ background: "#d4a052", color: "#08080a" }}
              >
                {loading ? "Setting up..." : "Launch my site \u2192"}
              </button>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar */}
      {(step === "name" || step === "description" || step === "contact") && (
        <div className="px-4 pb-6 pt-2" style={{ background: "#08080a" }}>
          <div className="mx-auto max-w-xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  step === "name"
                    ? "e.g. Sunrise Yoga Studio"
                    : step === "description"
                      ? "e.g. We offer private and group yoga classes..."
                      : "e.g. Buffalo, NY — hello@mybiz.com"
                }
                className="w-full px-4 py-3 rounded-xl text-[15px] outline-none transition-colors"
                style={{
                  background: "#0f0f12",
                  color: "#e8e8ec",
                  border: "1px solid #26262b",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#d4a052")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#26262b")}
              />
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes chatFadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

function PreviewCard({
  title,
  content,
  fields,
  listField,
  listLabel,
}: {
  title: string;
  content: Record<string, unknown>;
  fields: string[];
  listField?: string;
  listLabel?: string;
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: "#0f0f12", border: "1px solid #1c1c20" }}>
      <h3
        className="text-xs font-medium uppercase tracking-wider mb-2"
        style={{ color: "#d4a052" }}
      >
        {title}
      </h3>
      {fields.map((field) => {
        const val = content[field];
        if (!val || typeof val !== "string") return null;
        return (
          <p
            key={field}
            className={field === fields[0] ? "text-base font-semibold mb-1" : "text-sm mb-1"}
            style={{ color: field === fields[0] ? "#e8e8ec" : "#8e8e96" }}
          >
            {val}
          </p>
        );
      })}
      {listField && listLabel && Array.isArray(content[listField]) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {(content[listField] as Record<string, unknown>[]).slice(0, 5).map((item, i) => (
            <span
              key={i}
              className="text-xs px-2.5 py-1 rounded-full"
              style={{ background: "rgba(212, 160, 82, 0.12)", color: "#d4a052" }}
            >
              {item[listLabel] as string}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
