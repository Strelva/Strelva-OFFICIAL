import { getHostedSite } from '@/products/websites/index';
import { publicBusinessProfile } from '@/platform/agent-channel/profile';
import { publicFactsFromRecord } from '@/products/connected-sites/contracts';
import { businessFactSheet } from '@/products/connected-sites/business-page';
export const dynamic = 'force-dynamic';
export async function GET() { const unavailable = () => new Response('Not found\n', { status: 404, headers: { 'Cache-Control': 'no-store' } }); if (process.env.STRELVA_AGENT_READABLE !== '1' || process.env.STRELVA_WORKSPACE_RELEASE !== '1')
    return unavailable(); const hosted = await getHostedSite(); if (!hosted || hosted.preview)
    return unavailable(); try {
    const p = await publicBusinessProfile(hosted.tenant);
    const facts = { ...publicFactsFromRecord(p), policies: p.policies, verification: p.verification };
    if (!facts.name)
        return unavailable();
    return new Response(businessFactSheet(facts, hosted.origin), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
catch {
    return new Response('Temporarily unavailable\n', { status: 503, headers: { 'Cache-Control': 'no-store' } });
} }
