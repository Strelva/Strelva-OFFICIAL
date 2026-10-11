import { z } from 'zod';
import { inquiryRecordsRpc } from '@/platform/infra/inquiry-records';
import { customerEmailEnabled } from '@/platform/infra/email/enabled';
export const isolatedAgentConfirmation = () => process.env.STRELVA_WORKSPACE_RELEASE === '1' && ['1', 'workspace'].includes(process.env.STRELVA_AGENT_CHANNEL_RELEASE || '');
export async function agentChannelPolicy(scope: string) { return z.object({ enabled: z.boolean(), killed: z.boolean(), workspaceId: z.uuid() }).parse(await inquiryRecordsRpc('read_agent_channel_policy', { p_scope: scope })); }
export async function agentConfirmationEmailAllowed(scope: string) { if (!isolatedAgentConfirmation() || !customerEmailEnabled())
    return false; try {
    return (await agentChannelPolicy(scope)).enabled;
}
catch {
    return false;
} }
