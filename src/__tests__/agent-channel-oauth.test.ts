import { EventEmitter } from 'node:events';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const f = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn(), rpc: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: f.lookup }));
vi.mock('node:https', () => ({ request: f.request }));
vi.mock('@/platform/infra/db/client', () => ({ getSupabase: () => ({ rpc: f.rpc }) }));
import { authorizationMetadata, protectedMetadata, resourceUrl, cimdUrl, fetchCimd, parseAuthorization, pkce, exchangeAgentCode, validateAgentToken } from '@/platform/agent-channel/oauth';
import { isPublicIPv4Address } from '@/platform/infra/pinned-lookup';
const id = 'https://assistant.example.test/client.json';
const metadata = { client_id: id, client_name: 'Fixture', redirect_uris: ['https://assistant.example.test/callback'], token_endpoint_auth_method: 'none' as const };
const auth = { response_type: 'code', client_id: id, redirect_uri: metadata.redirect_uris[0], resource: resourceUrl(), code_challenge: 'x'.repeat(43), code_challenge_method: 'S256', scope: 'business:read' };
function transport(body: unknown, status = 200) { f.request.mockImplementation((_u, _options, cb) => { const req = new EventEmitter() as EventEmitter & {
    end: () => void;
    destroy: ReturnType<typeof vi.fn>;
}; req.end = () => { const r = new EventEmitter() as EventEmitter & {
    statusCode: number;
    headers: Record<string, string>;
    resume: () => void;
}; r.statusCode = status; r.headers = { 'content-type': 'application/json' }; r.resume = () => { }; cb(r); queueMicrotask(() => { r.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))); r.emit('end'); }); }; req.destroy = vi.fn((error?: Error) => { if (error)
    req.emit('error', error); }); return req; }); }
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('STRELVA_MCP_OAUTH', '1'); vi.stubEnv('STRELVA_WORKSPACE_RELEASE', '1'); f.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]); f.rpc.mockResolvedValue({ data: null, error: null }); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe('MCP scoped OAuth', () => {
    it('discovers CIMD, S256 and the exact platform resource with minimal basic scopes', () => { expect(authorizationMetadata()).toMatchObject({ client_id_metadata_document_supported: true, code_challenge_methods_supported: ['S256'], scopes_supported: ['business:read', 'inquiries:read', 'quotes:approve'] }); expect(protectedMetadata()).toMatchObject({ resource: resourceUrl(), scopes_supported: ['business:read'] }); });
    it('rejects literal private, local, credentialed, redirect and fragment CIMD URLs', () => { for (const s of ['http://example.test/client.json', 'https://127.0.0.1/client.json', 'https://169.254.169.254/client.json', 'https://[::1]/client.json', 'https://localhost/client.json', 'https://u:p@example.test/client.json', 'https://example.test/client.json#x', 'https://example.test/'])
        expect(() => cimdUrl(s)).toThrow(); });
    it('uses exact public address ranges without blocking adjacent public networks', () => { for (const ip of ['10.1.1.1', '100.64.1.1', '192.0.2.1', '198.51.100.1', '203.0.113.1', '127.0.0.1', '224.1.1.1'])
        expect(isPublicIPv4Address(ip)).toBe(false); for (const ip of ['198.51.101.1', '203.0.114.1', '93.184.216.34'])
        expect(isPublicIPv4Address(ip)).toBe(true); });
    it('refuses mixed-public/private DNS before opening a socket', async () => { f.lookup.mockResolvedValue([{ address: '93.184.216.34' }, { address: '10.0.0.1' }]); await expect(fetchCimd(id)).rejects.toThrow(); expect(f.request).not.toHaveBeenCalled(); });
    it('pins the validated socket and checks CIMD identity', async () => { transport(metadata); expect((await fetchCimd(id)).client_id).toBe(id); expect(f.request.mock.calls[0]?.[1]).toMatchObject({ family: 4, autoSelectFamily: false }); transport({ ...metadata, client_id: 'https://other.test/client.json' }); await expect(fetchCimd(id)).rejects.toThrow(); });
    it('rejects redirects, oversized bodies and unsupported authentication', async () => { transport({}, 302); await expect(fetchCimd(id)).rejects.toThrow(); transport('x'.repeat(17000)); await expect(fetchCimd(id)).rejects.toThrow(); transport({ ...metadata, token_endpoint_auth_method: 'client_secret_basic' }); await expect(fetchCimd(id)).rejects.toThrow(); });
    it('whole request deadline destroys the active connection', async () => { vi.useFakeTimers(); const req = new EventEmitter() as EventEmitter & {
        end: () => void;
        destroy: ReturnType<typeof vi.fn>;
    }; req.end = () => { }; req.destroy = vi.fn((e?: Error) => { if (e)
        req.emit('error', e); }); f.request.mockReturnValue(req); const result = fetchCimd(id).catch(e => e); await vi.advanceTimersByTimeAsync(5001); expect(await result).toBeInstanceOf(Error); expect(req.destroy).toHaveBeenCalled(); });
    it('does not start a socket when DNS returns after expiry', async () => { vi.useFakeTimers(); let finish!: (v: unknown) => void; f.lookup.mockImplementation(() => new Promise(r => { finish = r; })); const result = fetchCimd(id).catch(e => e); await vi.advanceTimersByTimeAsync(5001); await result; finish([{ address: '93.184.216.34' }]); await Promise.resolve(); expect(f.request).not.toHaveBeenCalled(); });
    it('binds exact redirect and resource and rejects excessive scopes', async () => { const fetcher = vi.fn().mockResolvedValue(metadata); await expect(parseAuthorization(auth, fetcher)).resolves.toMatchObject({ scopes: ['business:read'] }); for (const bad of [{ resource: 'https://other.test/mcp' }, { redirect_uri: 'https://attacker.test/callback' }, { scope: 'business:read all:write' }, { code_challenge_method: 'plain' }])
        await expect(parseAuthorization({ ...auth, ...bad }, fetcher)).rejects.toThrow(); });
    it('token exchange requires resource and one PKCE verifier, passes hash only to SQL', async () => { f.rpc.mockResolvedValue({ data: { expiresIn: 3600, scope: 'business:read', workspaceId: 'ac161100-0000-4000-8000-000000000010' }, error: null }); const p = new URLSearchParams({ grant_type: 'authorization_code', client_id: id, redirect_uri: metadata.redirect_uris[0]!, resource: resourceUrl(), code: 'a'.repeat(43), code_verifier: 'v'.repeat(43) }); const token = await exchangeAgentCode(p); expect(token.expires_in).toBe(3600); expect(f.rpc).toHaveBeenCalledWith('exchange_agent_oauth_code', expect.objectContaining({ p_resource: resourceUrl(), p_challenge: pkce('v'.repeat(43)), p_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/) })); expect(JSON.stringify(f.rpc.mock.calls)).not.toContain(token.access_token); p.append('resource', resourceUrl()); await expect(exchangeAgentCode(p)).rejects.toThrow(); });
    it('ignores URI tokens and validates header tokens against business, resource and scope', async () => { const req = new Request('https://app.strelva.com/api/mcp/public?access_token=' + 'a'.repeat(43)); expect(await validateAgentToken(req, 'quotes:approve', 'ac161100-0000-4000-8000-000000000010')).toBeNull(); expect(f.rpc).not.toHaveBeenCalled(); await validateAgentToken(new Request(req.url, { headers: { Authorization: 'Bearer ' + 'a'.repeat(43) } }), 'quotes:approve', 'ac161100-0000-4000-8000-000000000010'); expect(f.rpc).toHaveBeenCalledWith('validate_agent_oauth_token', expect.objectContaining({ p_scope: 'quotes:approve', p_resource: resourceUrl(), p_workspace_id: 'ac161100-0000-4000-8000-000000000010' })); });
});
