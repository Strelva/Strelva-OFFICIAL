import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { AuthorizeAssistant } from '../../../connect/authorize/AuthorizeAssistant';
import { BusinessEvidence } from '@/products/connected-sites/BusinessEvidence';
import { ConnectionPreview } from './ConnectionPreview';
import { unknownVerification } from '@/platform/agent-channel/profile';
export default async function Proof({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV !== 'development' || process.env.STRELVA_UI_PREVIEW !== '1') notFound();
  const p = await searchParams;
  const v = p.empty === '1' ? unknownVerification : { ...unknownVerification, domain: { verified: true, url: 'https://fictional-consulting.example.test', confirmedAt: '2026-10-07T00:00:00Z' }, googleBusinessProfile: { linked: true, verified: null, url: null }, ownerConfirmedFactCount: 8, lastConfirmedAt: '2026-10-07T00:00:00Z', operatingAgencies: [{ name: 'Fictional Buffalo Consulting Agency' }] };
  return <main className="min-h-dvh bg-canvas px-6 py-12 text-warm-black md:px-8"><div className="mx-auto max-w-[560px]"><Card padding="lg">
    {p.connections ? <ConnectionPreview mode={p.connections} /> : p.evidence === '1' ? <section aria-labelledby="biz-verification" className="grid gap-4"><h2 id="biz-verification" className="text-xl font-semibold leading-7 tracking-tight text-warm-black">Business evidence</h2><BusinessEvidence verification={v}/></section> : <AuthorizeAssistant clientName="Fixture Assistant" clientHost="assistant.example.test" returnHost="assistant.example.test" params={{}} scopes={['business:read', 'website:read', 'website:propose']} choices={p.empty === '1' ? [] : [{ workspaceId: '00000000-0000-4000-8000-000000000010', name: 'Fixture Consulting', agencyId: null, agencyName: null }]}/>}
  </Card></div></main>;
}
