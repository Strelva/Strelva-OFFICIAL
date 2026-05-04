"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type ChatStep = "name" | "description" | "contact" | "website" | "submitted";

interface Message {
  from: "scaffold" | "user";
  text: string;
}

interface IntakeInfo {
  businessName: string;
  description: string;
  location: string;
  email: string;
  currentWebsite: string;
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
    { from: "scaffold", text: ref ? `Hey! ${ref} sent you. What's your business called?` : "What's your business called?" },
  ]);
  const [input, setInput] = useState("");
  const [info, setInfo] = useState<IntakeInfo>({
    businessName: "",
    description: "",
    location: "",
    email: "",
    currentWebsite: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, step]);

  useEffect(() => {
    if (step !== "submitted") {
      inputRef.current?.focus();
    }
  }, [step]);

  function addMessages(...msgs: Message[]) {
    setMessages((prev) => [...prev, ...msgs]);
  }

  function getEmailFromContact(value: string) {
    const emailMatch = value.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
    const email = emailMatch ? emailMatch[0] : "";
    const location = value.replace(emailMatch?.[0] ?? "", "").replace(/[—\-,]\s*$/, "").trim();
    return { email, location };
  }

  function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async function handleSend() {
    const value = input.trim();
    if (!value || submitting) return;
    setError("");

    if (step === "name") {
      setInput("");
      setInfo((prev) => ({ ...prev, businessName: value }));
      addMessages(
        { from: "user", text: value },
        { from: "scaffold", text: `Tell me about ${value}. What do you do, and who are your customers?` }
      );
      setStep("description");
    } else if (step === "description") {
      setInput("");
      setInfo((prev) => ({ ...prev, description: value }));
      addMessages(
        { from: "user", text: value },
        { from: "scaffold", text: "Where are you located? And what's the best email to reach you?" }
      );
      setStep("contact");
    } else if (step === "contact") {
      const { email, location } = getEmailFromContact(value);
      if (!isValidEmail(email)) {
        setError("Add a valid email before we move on, e.g. hello@yourbusiness.com.");
        return;
      }
      setInput("");
      setInfo((prev) => ({ ...prev, location, email }));
      addMessages(
        { from: "user", text: value },
        { from: "scaffold", text: "Do you have a current website? Paste the URL, or say \"no\" if you're starting fresh." }
      );
      setStep("website");
    } else if (step === "website") {
      setInput("");
      const nextInfo = { ...info, currentWebsite: value };
      setInfo(nextInfo);
      addMessages(
        { from: "user", text: value },
        { from: "scaffold", text: "Got it. Sending this over now..." }
      );
      await submitIntake(nextInfo);
    }
  }

  async function submitIntake(data: IntakeInfo) {
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/onboard/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: data.businessName,
          description: data.description,
          location: data.location,
          email: data.email,
          currentWebsite: data.currentWebsite,
          referredBy: ref || undefined,
        }),
      });
      if (!res.ok) {
        let message = "We couldn't send this. Your answers are still here — try again.";
        if (res.status === 429) {
          message = "Too many attempts right now. Wait a bit, then try again.";
        } else {
          try {
            const body = await res.json();
            if (typeof body?.error === "string") message = body.error;
          } catch {}
        }
        setError(message);
        return;
      }
      addMessages({
        from: "scaffold",
        text: `You're all set. We'll be in touch within 24 hours to talk about ${data.businessName}'s new site.`,
      });
      setStep("submitted");
    } catch {
      setError("We couldn't reach the server. Your answers are still here — try again.");
    } finally {
      setSubmitting(false);
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
                {msg.from === "scaffold" && (
                  <span
                    className="block text-xs font-medium mb-1 tracking-wide"
                    style={{ color: "#d4a052" }}
                  >
                    Scaffold Web
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

          {/* Submitted state */}
          {step === "submitted" && (
            <div className="space-y-4 mt-6" style={{ animation: "chatFadeIn 0.3s ease-out both" }}>
              <div className="rounded-xl p-5" style={{ background: "#0f0f12", border: "1px solid #1c1c20" }}>
                <h3
                  className="text-xs font-medium uppercase tracking-wider mb-3"
                  style={{ color: "#d4a052" }}
                >
                  What happens next
                </h3>
                <ul className="space-y-2">
                  {[
                    "We'll review your info and reach out within 24 hours",
                    "We build your custom site — designed for your business, not a template",
                    "Once it's live, AI takes over: updates, reports, newsletters, everything",
                    "You just text what you need. It happens.",
                  ].map((item, i) => (
                    <li key={i} className="text-[14px] flex items-start gap-2" style={{ color: "#8e8e96" }}>
                      <span className="mt-1 block w-1 h-1 rounded-full shrink-0" style={{ background: "#d4a052" }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {info.email && (
                <p className="text-[13px] text-center" style={{ color: "#55555c" }}>
                  We&rsquo;ll email {info.email} to get started.
                </p>
              )}
            </div>
          )}

          {error && (
            <div
              className="rounded-lg px-4 py-2.5 text-sm"
              style={{ background: "rgba(220, 38, 38, 0.1)", color: "#f87171" }}
            >
              <div>{error}</div>
              {step === "website" && info.currentWebsite && (
                <button
                  type="button"
                  onClick={() => submitIntake(info)}
                  disabled={submitting}
                  className="mt-2 text-xs font-medium underline disabled:opacity-60"
                >
                  {submitting ? "Retrying..." : "Try sending again"}
                </button>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar */}
      {step !== "submitted" && (
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
                disabled={submitting}
                placeholder={
                  step === "name"
                    ? "e.g. Sunrise Yoga Studio"
                    : step === "description"
                      ? "e.g. We offer private and group yoga classes..."
                      : step === "contact"
                        ? "e.g. City, ST — hello@mybiz.com"
                        : "e.g. www.mybusiness.com or \"no\""
                }
                className="w-full px-4 py-3 rounded-xl text-[15px] outline-none transition-colors"
                style={{
                  background: "#0f0f12",
                  color: "#e8e8ec",
                  border: "1px solid #26262b",
                  opacity: submitting ? 0.6 : 1,
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
