import { z } from 'zod';
import { workspaceHttpActor, workspaceWriteGuard, readWorkspaceBody, workspaceJson } from '@/platform/workspaces/http';
import { inquiryRecordsRpc } from '@/platform/infra/inquiry-records';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { if (process.env.STRELVA_WORKSPACE_RELEASE !== '1')
    return workspaceJson({ error: 'Not enabled' }, 503); const guard = workspaceWriteGuard(request); if (guard)
    return guard; const actor = await workspaceHttpActor(); if (!actor)
    return workspaceJson({ error: 'Sign in with a verified email.' }, 401); try {
    const i = z.object({ workspaceId: z.uuid(), consented: z.boolean(), reason: z.string().trim().min(3).max(500) }).strict().parse(await readWorkspaceBody(request, 2000));
    return workspaceJson({ consented: await inquiryRecordsRpc('set_agent_channel_consent', { p_workspace_id: i.workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_consented: i.consented, p_reason: i.reason }) });
}
catch {
    return workspaceJson({ error: 'Only the business owner can change customer confirmation consent.' }, 403);
} }
