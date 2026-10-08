import { authorizationMetadata, oauthEnabled } from '@/platform/agent-channel/oauth';
export const dynamic = 'force-dynamic';
export function GET() { return Response.json(oauthEnabled() ? authorizationMetadata() : { error: 'temporarily_unavailable' }, { status: oauthEnabled() ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }); }
