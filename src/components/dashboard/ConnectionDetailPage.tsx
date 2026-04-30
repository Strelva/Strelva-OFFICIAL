"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, CircleCheck, Unplug, Loader2 } from "lucide-react";

interface ConnectionDetail {
  id: string;
  name: string;
  icon: string;
  connected: boolean;
  description: string;
  usageExamples: Array<{
    title: string;
    prompt: string;
    response: string;
  }>;
  metadata: {
    frequency: string;
    connectedSince: string;
    usedIn: string;
  };
  configField?: string; // tenant config field name, e.g. "googleSearchConsoleKey"
}

const CONNECTION_DETAILS: Record<string, ConnectionDetail> = {
  "google-search-console": {
    id: "google-search-console",
    name: "Google Search Console",
    icon: "SC",
    connected: false, // Will be overridden by actual connection status
    description:
      "Connect your Google Search Console to let your AI track how people find you on Google. See which search terms bring visitors, which pages rank highest, and get suggestions to improve your SEO. Powers your weekly \"how people found you\" report.",
    usageExamples: [
      {
        title: "What are people searching to find me?",
        prompt: "What search terms bring people to my site?",
        response:
          "Your top searches this week: 'yoga studio downtown' (23 clicks), 'morning yoga class' (15 clicks), 'beginner yoga near me' (8 clicks). Your 'Services' page ranks #3 for 'yoga studio downtown.'",
      },
      {
        title: "How can I rank higher?",
        prompt: "How can I improve my Google ranking?",
        response:
          "You're showing up for 'beginner yoga' but not getting clicks — your title might be too generic. Want me to update it to 'Beginner-Friendly Yoga Classes | [Your Studio]'?",
      },
    ],
    metadata: {
      frequency: "Every 24 hours",
      connectedSince: "",
      usedIn: "Weekly reports, SEO insights, AI suggestions",
    },
    configField: "googleSearchConsoleKey",
  },
  "google-analytics": {
    id: "google-analytics",
    name: "Google Analytics",
    icon: "GA",
    connected: true,
    description:
      "Your AI reads your Google Analytics data and turns it into plain-English insights you can actually use. It powers your weekly report (\"47 people found you this week\"), surfaces which pages are working, spots trends, and suggests actions — like adding a call-to-action to your most-visited page. No dashboards to learn. No numbers to interpret. Just ask.",
    usageExamples: [
      {
        title: "@Analytics: how did my site do this week?",
        prompt: "@Analytics: how did my site do this week?",
        response:
          "Your site had 47 visitors this week, up 12% from last week. Your Services page got the most views (28). 3 people clicked Book Now — all on Tuesday after you posted about the new class.",
      },
      {
        title: "@Analytics: which page gets the most traffic?",
        prompt: "@Analytics: which page gets the most traffic?",
        response:
          "Your Services page is your top performer with 28 views this week. Your homepage didn't get 7. Turn me to add a stronger call-to-action on Services?",
      },
    ],
    metadata: {
      frequency: "Every 24 hours",
      connectedSince: "March 20, 2026",
      usedIn: "Weekly reports, AI suggestions, chat",
    },
  },
  newsletter: {
    id: "newsletter",
    name: "Newsletter",
    icon: "NL",
    connected: true,
    description:
      "Your AI drafts and sends email newsletters to your subscriber list. Tell it what to write about and it'll create a professional email, preview it for your approval, and send it when you say go. Great for monthly updates, new service announcements, or seasonal promotions.",
    usageExamples: [
      {
        title: "Send an update about my new class",
        prompt: "Send an update to subscribers about my new Saturday yoga class",
        response:
          "I've drafted a newsletter about your Saturday Morning Yoga class. It highlights the 8AM start time, the 75-minute grounding practice, and includes a Book Now button. Want me to send it?",
      },
      {
        title: "How many subscribers do I have?",
        prompt: "How many newsletter subscribers do I have?",
        response:
          "You have 142 active subscribers. Your last email had a 34% open rate, which is above average for small businesses. Want me to send another update?",
      },
    ],
    metadata: {
      frequency: "On demand",
      connectedSince: "March 15, 2026",
      usedIn: "Email campaigns, subscriber management",
    },
  },
  "google-business": {
    id: "google-business",
    name: "Google Business",
    icon: "GB",
    connected: false,
    description:
      "Connect your Google Business Profile so your AI can keep your listing up to date, respond to reviews, and sync your hours automatically. When you update your site, your Google listing updates too.",
    usageExamples: [
      {
        title: "Respond to my latest review",
        prompt: "Respond to my latest Google review",
        response:
          "You got a 5-star review from Sarah M: \"Best yoga studio in town!\" I've drafted a reply thanking her and mentioning your new Saturday class. Want me to post it?",
      },
      {
        title: "Are my Google hours up to date?",
        prompt: "Check if my Google Business hours match my site",
        response:
          "Your Google listing shows Mon-Fri 6am-8pm but your site says 7am-9pm. Want me to update Google to match?",
      },
    ],
    metadata: {
      frequency: "Daily sync",
      connectedSince: "",
      usedIn: "Reviews, business listing, hours",
    },
  },
  instagram: {
    id: "instagram",
    name: "Instagram",
    icon: "IG",
    connected: false,
    description:
      "Let your AI auto-post to Instagram from your site's content. When you add a new blog post, service, or event, it can create and schedule an Instagram post with the right hashtags and a compelling caption.",
    usageExamples: [
      {
        title: "Post about my new class",
        prompt: "Create an Instagram post about my Saturday yoga class",
        response:
          "I've created a post with your class photo, a caption about the grounding practice, and relevant hashtags. Scheduled for Thursday at 10am when your followers are most active.",
      },
      {
        title: "What should I post this week?",
        prompt: "Suggest Instagram content for this week",
        response:
          "Based on your upcoming schedule: Monday — behind-the-scenes studio prep. Wednesday — client testimonial (Sarah's review was great). Friday — Saturday class reminder with early-bird CTA.",
      },
    ],
    metadata: {
      frequency: "On demand + scheduled",
      connectedSince: "",
      usedIn: "Social media, content marketing",
    },
  },
  calendly: {
    id: "calendly",
    name: "Calendly",
    icon: "CL",
    connected: false,
    description:
      "Sync your Calendly availability with your site. Your AI can check your schedule, suggest appointment times to clients, and automatically update your site's booking links.",
    usageExamples: [
      {
        title: "When am I free this week?",
        prompt: "Check my availability for Thursday",
        response:
          "You have openings at 10am, 1pm, and 3:30pm on Thursday. Want me to send a booking link to a specific client?",
      },
      {
        title: "Update my booking page",
        prompt: "Add a 30-minute consultation option to my booking",
        response:
          "I've added a '30-min Free Consultation' option to your Calendly. It's now showing on your site's booking page too.",
      },
    ],
    metadata: {
      frequency: "Real-time sync",
      connectedSince: "",
      usedIn: "Booking, scheduling, availability",
    },
  },
  yelp: {
    id: "yelp",
    name: "Yelp",
    icon: "YP",
    connected: false,
    description:
      "Monitor and respond to your Yelp reviews through your AI. Get notified when new reviews come in, draft professional responses, and keep your Yelp listing accurate.",
    usageExamples: [
      {
        title: "Any new Yelp reviews?",
        prompt: "Check for new Yelp reviews",
        response:
          "You got 2 new reviews this week — both 5 stars! One mentions your instructor by name. Want me to draft thank-you responses?",
      },
      {
        title: "What's my Yelp rating?",
        prompt: "What's my current Yelp rating?",
        response:
          "You're at 4.7 stars from 38 reviews. Your highest-rated aspect is 'friendly staff.' Your competitors average 4.2 stars.",
      },
    ],
    metadata: {
      frequency: "Every 12 hours",
      connectedSince: "",
      usedIn: "Review management, reputation",
    },
  },
};

export function ConnectionDetailPage({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const detail = CONNECTION_DETAILS[connectionId];

  const [credentialsValue, setCredentialsValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveCredentials = async () => {
    if (!detail?.configField || !credentialsValue.trim()) return;

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch("/api/tenant-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [detail.configField]: credentialsValue }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      setSaved(true);
      setCredentialsValue(""); // Clear after save
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!detail) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-muted">Connection not found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-14 py-10">
      {/* Back link */}
      <button
        onClick={() => router.push("/dashboard/connections")}
        className="flex items-center gap-1.5 text-gray-faint hover:text-gray-muted transition-colors mb-8"
      >
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
        <span className="text-[13px]">Connections</span>
      </button>

      {/* Header */}
      <div className="flex items-center gap-5 mb-8">
        <div className="w-16 h-16 rounded-[18px] bg-accent-dim border border-accent/20 flex items-center justify-center">
          <span className="text-[20px] font-bold text-accent">{detail.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-semibold text-warm-black">{detail.name}</h1>
          <p className="text-[13px] text-gray-muted mt-1">
            Traffic data for reports & AI suggestions
          </p>
        </div>
        {detail.connected ? (
          <span className="flex items-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-[13px] font-medium text-white">
            <CircleCheck className="w-4 h-4" strokeWidth={2} />
            Connected
          </span>
        ) : (
          <button className="rounded-xl bg-accent px-6 py-2.5 text-[13px] font-medium text-white hover:bg-accent/80 transition-colors">
            Connect
          </button>
        )}
      </div>

      {/* Usage examples */}
      <div className="flex gap-4 mb-8">
        {detail.usageExamples.map((example, i) => (
          <div
            key={i}
            className="flex-1 rounded-[20px] bg-surface-raised border border-gray-border p-6 flex flex-col justify-center gap-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.08)]"
          >
            <div className="flex items-center gap-1.5 text-[12px]">
              <span className="font-medium text-accent">@{detail.name.split(" ")[0]}</span>
              <span className="text-[#ffffffcc]">{example.title.replace(`@${detail.name.split(" ")[0]}: `, "")}</span>
            </div>
            <p className="text-[12px] text-[#ffffffcc] leading-relaxed">
              {example.response}
            </p>
          </div>
        ))}
      </div>

      {/* Description */}
      <p className="text-[13px] text-gray-muted leading-[1.6] max-w-[700px] mb-8">
        {detail.description}
      </p>

      {/* Metadata */}
      <div className="flex gap-8 mb-8">
        <div>
          <span className="text-[11px] text-gray-faint uppercase tracking-wider">Sync frequency</span>
          <p className="text-[13px] text-warm-black mt-1">{detail.metadata.frequency}</p>
        </div>
        {detail.metadata.connectedSince && (
          <div>
            <span className="text-[11px] text-gray-faint uppercase tracking-wider">Connected since</span>
            <p className="text-[13px] text-warm-black mt-1">{detail.metadata.connectedSince}</p>
          </div>
        )}
        <div>
          <span className="text-[11px] text-gray-faint uppercase tracking-wider">Used in</span>
          <p className="text-[13px] text-warm-black mt-1">{detail.metadata.usedIn}</p>
        </div>
      </div>

      {/* Credentials form for configurable connections */}
      {detail.configField && (
        <div className="mb-8 max-w-[600px]">
          <h3 className="text-[13px] font-medium text-warm-black mb-3">
            {detail.id === "google-search-console" ? "Service Account Key (JSON)" : "Credentials"}
          </h3>
          <textarea
            value={credentialsValue}
            onChange={(e) => setCredentialsValue(e.target.value)}
            placeholder={
              detail.id === "google-search-console"
                ? 'Paste your Google Cloud service account JSON key here...'
                : "Enter credentials..."
            }
            rows={6}
            className="w-full rounded-xl bg-surface-raised border border-gray-border px-4 py-3 text-[13px] text-warm-black placeholder:text-gray-faint font-mono resize-none focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          <div className="flex items-center gap-4 mt-3">
            <button
              onClick={handleSaveCredentials}
              disabled={saving || !credentialsValue.trim()}
              className="rounded-xl bg-accent px-5 py-2 text-[13px] font-medium text-white hover:bg-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? "Saving..." : "Save Credentials"}
            </button>
            {saved && (
              <span className="text-[12px] text-accent flex items-center gap-1.5">
                <CircleCheck className="w-3.5 h-3.5" />
                Saved
              </span>
            )}
            {error && (
              <span className="text-[12px] text-terra">{error}</span>
            )}
          </div>
          {detail.id === "google-search-console" && (
            <p className="text-[11px] text-gray-faint mt-3 leading-relaxed">
              Create a service account in Google Cloud Console, download the JSON key, and paste it above.
              Make sure the service account has access to your Search Console property.
            </p>
          )}
        </div>
      )}

      {/* Disconnect */}
      {detail.connected && (
        <button className="flex items-center gap-3 text-terra hover:text-terra-light transition-colors">
          <Unplug className="w-4 h-4" strokeWidth={1.5} />
          <span className="text-[13px] font-medium">Disconnect</span>
        </button>
      )}
    </div>
  );
}
