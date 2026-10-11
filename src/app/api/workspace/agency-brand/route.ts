import { z } from "zod";
import { AgencyBrandReplyToError, manageAgencyBrand, validateBrand } from "@/platform/agency-brand/server";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard, readWorkspaceBody } from "@/platform/workspaces/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in with a confirmed email." }, 401);
  try { return workspaceJson({ brand: await manageAgencyBrand(actor, z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId"))) }); }
  catch (error) { return workspaceHttpFailure(error); }
}
export async function PUT(request: Request) {
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in with a confirmed email." }, 401);
  try {
    const body = z.object({ workspaceId: z.string().uuid(), brand: z.unknown() }).strict().parse(await readWorkspaceBody(request, 360000));
    let brand; try { brand = validateBrand(body.brand); } catch { return workspaceJson({ error: "Check the name, reply address and hex color. Logos must be PNG, JPEG or WebP up to 256 KiB and 2048 pixels per side." }, 400); }
    return workspaceJson({ brand: await manageAgencyBrand(actor, body.workspaceId, brand) });
  } catch (error) {
    if (error instanceof AgencyBrandReplyToError) return workspaceJson({ error: error.message }, 400);
    return workspaceHttpFailure(error);
  }
}
