import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getSocialPosts, setSocialPosts } from "@/lib/storage";
import type { SocialPost } from "@/lib/types";

// --- GET: list social posts for tenant ---

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const posts = await getSocialPosts(tenant);
  return NextResponse.json(posts);
}

// --- POST: create a new social post (draft or scheduled) ---

export async function POST(req: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const body = await req.json();

  const platform = body.platform;
  const content = body.content;
  if (!platform || !content) {
    return NextResponse.json({ error: "platform and content are required" }, { status: 400 });
  }

  const validPlatforms = ["instagram", "facebook", "x"];
  if (!validPlatforms.includes(platform)) {
    return NextResponse.json({ error: `Invalid platform. Must be one of: ${validPlatforms.join(", ")}` }, { status: 400 });
  }

  const post: SocialPost = {
    id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    platform,
    content,
    imageUrl: body.imageUrl || undefined,
    status: body.scheduledFor ? "scheduled" : "draft",
    scheduledFor: body.scheduledFor || undefined,
    createdAt: new Date().toISOString(),
  };

  const posts = await getSocialPosts(tenant);
  posts.unshift(post);
  await setSocialPosts(tenant, posts);

  return NextResponse.json(post, { status: 201 });
}

// --- PATCH: update post status ---

export async function PATCH(req: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const body = await req.json();
  const { id, status, scheduledFor } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const validTransitions: Record<string, string[]> = {
    draft: ["scheduled", "published"],
    scheduled: ["draft", "published"],
    published: [], // terminal state
  };

  const posts = await getSocialPosts(tenant);
  const post = posts.find((p) => p.id === id);
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (status) {
    const allowed = validTransitions[post.status] || [];
    if (!allowed.includes(status)) {
      return NextResponse.json(
        { error: `Cannot transition from ${post.status} to ${status}` },
        { status: 400 }
      );
    }
    post.status = status;
    if (status === "scheduled" && scheduledFor) {
      post.scheduledFor = scheduledFor;
    }
    if (status === "published") {
      post.publishedAt = new Date().toISOString();
    }
  }

  await setSocialPosts(tenant, posts);
  return NextResponse.json(post);
}

// --- DELETE: delete a draft post ---

export async function DELETE(req: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
  }

  const posts = await getSocialPosts(tenant);
  const post = posts.find((p) => p.id === id);

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.status !== "draft") {
    return NextResponse.json({ error: "Only draft posts can be deleted" }, { status: 400 });
  }

  const filtered = posts.filter((p) => p.id !== id);
  await setSocialPosts(tenant, filtered);

  return NextResponse.json({ success: true });
}
