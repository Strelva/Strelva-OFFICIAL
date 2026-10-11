'use client';
import { useState, useSyncExternalStore } from 'react';
const subscribeReady = () => () => {};
const controlsReady = () => true;
const serverControlsReady = () => false;
import { Button } from '@/components/ui/Button';
import { SelectInput } from '@/components/ui/TextInput';
export interface AssistantChoice {
    workspaceId: string;
    name: string;
    agencyId: string | null;
    agencyName: string | null;
}
const descriptions: Record<string, string> = { 'business:read': 'Read this business’s facts and services.', 'website:read': 'Read saved website content and its current revision.', 'website:propose': 'Save website changes for owner review. Cannot publish them.', 'inquiries:read': 'Read recent inquiries, including customer contact details.', 'quotes:approve': 'Record a price and terms you approve. Does not send email or charge customers.' };
export function AuthorizeAssistant({ clientName, clientHost, returnHost, params, scopes, choices }: {
    clientName: string;
    clientHost?: string;
    returnHost: string;
    params: Record<string, string>;
    scopes: string[];
    choices: AssistantChoice[];
}) {
    const available = choices.filter(c => !c.agencyId || scopes.every(s => s === 'business:read'));
    const ready = useSyncExternalStore(subscribeReady, controlsReady, serverControlsReady);
    const [choice, setChoice] = useState('0'), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    async function decide(decision: 'approve' | 'deny') { setBusy(true); setError(null); try {
        const chosen = available[Number(choice)];
        const r = await fetch('/api/mcp/oauth/authorize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, params, ...(chosen ? { workspaceId: chosen.workspaceId, agencyId: chosen.agencyId } : {}) }) });
        const body = await r.json();
        if (!r.ok || typeof body.redirectTo !== 'string')
            throw new Error(body.error || 'This connection could not be approved.');
        window.location.assign(body.redirectTo);
    }
    catch {
        setError('This connection could not be approved. Check that you are signed in and try again.');
        setBusy(false);
    } }
    return <div className="space-y-6"><div><h1 className="font-display text-2xl font-medium">Connect {clientName}</h1><p className="mt-2 text-base text-gray-muted">Choose the business this assistant may work with. This connection can renew access for up to 30 days. It works only while your business or agency permissions remain valid. Disconnect it in Strelva to revoke access permanently.</p></div>{clientHost && <p className="break-all text-sm text-gray-muted">Client identity verified at {clientHost}. The name above is supplied by that client.</p>}<ul className="space-y-2 text-sm">{scopes.map(s => <li key={s}>{descriptions[s]}</li>)}</ul>{available.length ? <label className="block text-sm font-medium">Business<SelectInput className="mt-2 w-full" value={choice} onChange={e => setChoice(e.target.value)} options={available.map((c, i) => ({ value: String(i), label: `${c.name}${c.agencyName ? ` · ${c.agencyName}` : ''}` }))}/></label> : <p className="text-sm text-gray-muted">You have no current business grant for these permissions. Only a business owner can share customer inquiries or approve pricing.</p>}<p className="text-sm text-gray-muted">You will return to {returnHost}. Manage or disconnect access from Connected assistants in Strelva.</p>{error && <p role="alert" className="text-sm text-critical">{error}</p>}<div className="flex flex-wrap gap-4"><Button onClick={() => decide('approve')} disabled={!ready || !available.length || busy} loading={busy}>Connect assistant</Button><Button variant="secondary" onClick={() => decide('deny')} disabled={!ready || busy}>Cancel</Button></div></div>;
}
