import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { collectionPreparationSchema, creatorListingCommandSchema, prepareGovernedCollection, readGovernedMoney, registerGovernedCreatorListing } from "@/platform/connect/governed-operations";
export const dynamic = "force-dynamic";
const released = () => workspaceReleaseEnabled() && process.env.STRELVA_REVENUE_SPLITS === "1";
const commandSchema = z.discriminatedUnion("action", [
  collectionPreparationSchema.extend({ action: z.literal("accept_collection_terms") }).strict(),
  creatorListingCommandSchema.extend({ action: z.literal("register_creator_listing") }).strict(),
]);
export async function GET(request: Request) {
  if (!released()) return workspaceJson({ error: "Recorded money terms are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in." }, 401);
    return workspaceJson(await readGovernedMoney(actor, z.uuid().parse(new URL(request.url).searchParams.get("workspaceId"))));
  } catch (error) { return workspaceHttpFailure(error); }
}
export async function POST(request: Request) {
  if (!released()) return workspaceJson({ error: "Recorded money terms are not enabled." }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in." }, 401);
    if (await isRateLimitedWindowedAsync(`money-preparation:${actor.userId}`, 20, 60000)) return workspaceJson({ error: "Please wait." }, 429);
    const input = commandSchema.parse(await readWorkspaceBody(request, 8000));
    const { action, ...command } = input;
    return workspaceJson(action === "accept_collection_terms" ? await prepareGovernedCollection(actor, command) : await registerGovernedCreatorListing(actor, command));
  } catch (error) { return workspaceHttpFailure(error); }
}
