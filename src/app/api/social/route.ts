import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getSocialPosts, setSocialPosts } from "@/lib/storage";
import { requireActiveSubscription } from "@/lib/subscription";
import { readJsonObject } from "@/lib/request-body";
import type { SocialPost } from "@/lib/types";

const VALID_PLATFORMS = ["instagram", "facebook", "x"] as const;

async function requireSocialWriteAccess(tenant: string): Promise<NextResponse | null> {
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;
  const permissionDenied = await requireTenantPermission(tenant, "content:write");
  if (permissionDenied) return permissionDenied;
  return requireActiveSubscription(tenant);
}

// --- GET: list social posts for tenant ---

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

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
  const blocked = await requireSocialWriteAccess(tenant);
  if (blocked) return blocked;

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const platform = typeof body.platform === "string" ? body.platform : "";
  const content = typeof body.content === "string" ? body.content : "";
  if (!platform || !content) {
    return NextResponse.json({ error: "platform and content are required" }, { status: 400 });
  }

  if (!isSocialPlatform(platform)) {
    return NextResponse.json({ error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(", ")}` }, { status: 400 });
  }

  const post: SocialPost = {
    id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    platform,
    content,
    imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : undefined,
    status: typeof body.scheduledFor === "string" ? "scheduled" : "draft",
    scheduledFor: typeof body.scheduledFor === "string" ? body.scheduledFor : undefined,
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
  const blocked = await requireSocialWriteAccess(tenant);
  if (blocked) return blocked;

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  const status = typeof body.status === "string" ? body.status : "";
  const scheduledFor = typeof body.scheduledFor === "string" ? body.scheduledFor : undefined;

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
    post.status = status as SocialPost["status"];
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

function isSocialPlatform(platform: string): platform is SocialPost["platform"] {
  return VALID_PLATFORMS.some((validPlatform) => validPlatform === platform);
}

// --- DELETE: delete a draft post ---

export async function DELETE(req: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const blocked = await requireSocialWriteAccess(tenant);
  if (blocked) return blocked;

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
