import { z } from 'zod';
import { inquiryRecordsRpc } from '@/platform/infra/inquiry-records';
import type { QueueActor } from './contracts';
import type { SourceRead } from './project';
export async function readAgentAbuseAlarms(actor: QueueActor): Promise<SourceRead> {
    const rows = z.array(z.object({ workspaceId: z.uuid(), openedAt: z.string(), holds: z.number(), confirmed: z.number() })).parse(await inquiryRecordsRpc('read_agent_channel_alarms', { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail }));
    return { kind: 'ops_alert', source: 'Agent booking confirmation', ok: true, rows: rows.map(r => ({ kind: 'ops_alert', sourceRef: `agent-hold-ratio:${r.workspaceId}`, tenantId: null, workspaceId: r.workspaceId, title: `Agent holds: ${r.confirmed} of ${r.holds} confirmed in 24 hours`, openedAt: r.openedAt, facts: { severity: 'high' }, href: `/admin/release-flags?workspaceId=${encodeURIComponent(r.workspaceId)}` })) };
}
