"use client";

import { useState, useEffect } from "react";
import { Instagram, Facebook, Twitter, Plus, Calendar, Trash2, Send } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { IconButton } from "@/components/ui/Button";
import { CapabilityGate } from "@/components/dashboard/CapabilityGate";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import type { SocialPost } from "@/lib/types";

const PLATFORM_ICONS = {
  instagram: Instagram,
  facebook: Facebook,
  x: Twitter,
} as const;

const PLATFORM_LABELS = {
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
} as const;

const PLATFORM_COLORS = {
  instagram: "text-pink-500",
  facebook: "text-blue-600",
  x: "text-gray-900",
} as const;

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SocialContent() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"draft" | "scheduled" | "published">("draft");
  const { setChatPrompt, setChatDrawerOpen } = useDashboard();

  useEffect(() => {
    fetchPosts();
  }, []);

  async function fetchPosts() {
    try {
      const res = await fetch("/api/social");
      if (res.ok) {
        setPosts(await res.json());
      } else {
        setError("Failed to load social posts");
      }
    } catch {
      setError("Failed to load social posts");
    } finally {
      setLoading(false);
    }
  }

  async function deletePost(id: string) {
    try {
      const res = await fetch(`/api/social?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== id));
      }
    } catch {
      setError("Failed to delete post");
      setTimeout(() => setError(null), 3000);
    }
  }

  async function updateStatus(id: string, status: string, scheduledFor?: string) {
    try {
      const res = await fetch("/api/social", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, scheduledFor }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPosts((prev) => prev.map((p) => (p.id === id ? updated : p)));
      }
    } catch {
      setError("Failed to update post");
      setTimeout(() => setError(null), 3000);
    }
  }

  function handleNewPost() {
    setChatPrompt("Draft a social media post about ");
    setChatDrawerOpen(true);
  }

  const filtered = posts.filter((p) => p.status === tab);

  const counts = {
    draft: posts.filter((p) => p.status === "draft").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    published: posts.filter((p) => p.status === "published").length,
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8 w-full max-w-7xl mx-auto h-full overflow-y-auto space-y-4">
        <SkeletonLine width="w-48" height="h-8" />
        <SkeletonLine width="w-full" height="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 w-full max-w-7xl mx-auto h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-warm-black tracking-tight">Social Media</h1>
          <p className="text-sm text-gray-muted mt-1">Draft and schedule posts from your site content</p>
        </div>
        <button
          onClick={handleNewPost}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-sage hover:bg-sage/90 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Post
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-600/5 border border-red-200 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card>
          <p className="text-2xl font-semibold text-warm-black">{counts.draft}</p>
          <p className="text-xs text-gray-muted mt-1">Drafts</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold text-warm-black">{counts.scheduled}</p>
          <p className="text-xs text-gray-muted mt-1">Scheduled</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold text-warm-black">{counts.published}</p>
          <p className="text-xs text-gray-muted mt-1">Published</p>
        </Card>
      </div>

      {/* Tab filter */}
      <div className="mb-6">
        <Tabs
          variant="segment"
          items={[
            { value: "draft", label: `Drafts (${counts.draft})` },
            { value: "scheduled", label: `Scheduled (${counts.scheduled})` },
            { value: "published", label: `Published (${counts.published})` },
          ]}
          value={tab}
          onChange={(v) => setTab(v as "draft" | "scheduled" | "published")}
        />
      </div>

      {/* Posts list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={
            tab === "draft"
              ? <Plus className="w-5 h-5 text-gray-muted" strokeWidth={1.5} />
              : tab === "scheduled"
              ? <Calendar className="w-5 h-5 text-gray-muted" strokeWidth={1.5} />
              : <Send className="w-5 h-5 text-gray-muted" strokeWidth={1.5} />
          }
          title={
            tab === "draft"
              ? "No drafts yet"
              : tab === "scheduled"
              ? "Nothing scheduled"
              : "No published posts"
          }
          description={
            tab === "draft"
              ? "Ask the AI to draft a social post from your site content."
              : tab === "scheduled"
              ? "Schedule a draft to queue it for publishing."
              : "Published posts will appear here."
          }
          className="py-16"
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((post) => {
            const PlatformIcon = PLATFORM_ICONS[post.platform];
            return (
              <Card
                key={post.id}
                className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className={`mt-0.5 ${PLATFORM_COLORS[post.platform]}`}>
                    <PlatformIcon className="w-5 h-5" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-warm-black line-clamp-2">{post.content}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-gray-muted">
                        {PLATFORM_LABELS[post.platform]}
                      </span>
                      <span className="text-xs text-gray-subtle">
                        {post.status === "published" && post.publishedAt
                          ? `Published ${formatDate(post.publishedAt)}`
                          : post.status === "scheduled" && post.scheduledFor
                          ? `Scheduled for ${formatDate(post.scheduledFor)}`
                          : `Created ${formatDate(post.createdAt)}`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant={
                      post.status === "draft"
                        ? "sage"
                        : post.status === "scheduled"
                        ? "emerald"
                        : "emerald"
                    }
                  >
                    {post.status}
                  </Badge>

                  {post.status === "draft" && (
                    <>
                      <IconButton
                        label="Schedule"
                        size="sm"
                        onClick={() => {
                          // Schedule for tomorrow at 10am
                          const tomorrow = new Date();
                          tomorrow.setDate(tomorrow.getDate() + 1);
                          tomorrow.setHours(10, 0, 0, 0);
                          updateStatus(post.id, "scheduled", tomorrow.toISOString());
                        }}
                      >
                        <Calendar className="w-4 h-4 text-sage" />
                      </IconButton>
                      <IconButton
                        label="Delete"
                        size="sm"
                        variant="danger"
                        onClick={() => deletePost(post.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </IconButton>
                    </>
                  )}

                  {post.status === "scheduled" && (
                    <IconButton
                      label="Mark published"
                      size="sm"
                      onClick={() => updateStatus(post.id, "published")}
                    >
                      <Send className="w-4 h-4 text-emerald-500" />
                    </IconButton>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SocialPage() {
  return (
    <CapabilityGate capability="social">
      <SocialContent />
    </CapabilityGate>
  );
}
