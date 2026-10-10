import { beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn() }));
vi.mock('@/platform/infra/db/server-client', () => ({ getSessionUser: f.session }));
vi.mock('@/platform/infra/db/client', () => ({ getSupabase: () => ({ rpc: f.rpc }) }));
import { GET } from '@/app/api/workspace/agent-connections/route';
import { DELETE } from '@/app/api/workspace/agent-connections/[connectionId]/route';
const workspace = 'ac181200-0000-4000-8000-000000000010', connection = 'ac181200-0000-4000-8000-000000000040';
const row = { id: connection, clientId: 'https://chatgpt.com/oauth/codex/client.json', clientName: 'Codex', scopes: ['business:read'], createdAt: '2026-10-08T00:00:00Z', expiresAt: '2026-11-07T00:00:00Z', revokedAt: null, lastUsedAt: null, agencyId: null, status: 'active' };
function remove(body: unknown = { workspaceId: workspace }, origin: string | null = 'https://app.strelva.test') {
  return new Request(`https://app.strelva.test/api/workspace/agent-connections/${connection}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
}
const context = { params: Promise.resolve({ connectionId: connection }) };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('STRELVA_MCP_OAUTH', '1'); vi.stubEnv('STRELVA_WORKSPACE_RELEASE', '1');
  f.session.mockResolvedValue({ id: 'ac181200-0000-4000-8000-000000000001', email: 'owner@example.test', email_confirmed_at: '2026-10-08T00:00:00Z' });
  f.rpc.mockResolvedValue({ data: [row], error: null });
});
describe('owner agent connection management', () => {
  it('lists bounded metadata using actor and business identity without credentials', async () => {
    const result = await GET(new Request(`https://app.strelva.test/api/workspace/agent-connections?workspaceId=${workspace}`));
    expect(result.status).toBe(200); expect(result.headers.get('cache-control')).toContain('no-store');
    expect(await result.json()).toEqual({ connections: [row] });
    expect(f.rpc).toHaveBeenCalledWith('list_agent_oauth_connections', expect.objectContaining({ p_workspace_id: workspace, p_user_id: 'ac181200-0000-4000-8000-000000000001' }));
  });
  it('denies disabled access, unverified sessions and ambiguous business selectors', async () => {
    const req = new Request(`https://app.strelva.test/api/workspace/agent-connections?workspaceId=${workspace}`);
    vi.stubEnv('STRELVA_MCP_OAUTH', '0'); expect((await GET(req)).status).toBe(503);
    vi.stubEnv('STRELVA_MCP_OAUTH', '1'); f.session.mockResolvedValue({ email: 'owner@example.test' }); expect((await GET(req)).status).toBe(401);
    f.session.mockResolvedValue({ id: workspace, email: 'owner@example.test', email_confirmed_at: 'today' });
    expect((await GET(new Request(`${req.url}&workspaceId=${workspace}`))).status).toBe(400);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it('fails closed when owner authority is refused', async () => {
    f.rpc.mockResolvedValue({ data: null, error: { message: 'workspace_access_denied' } });
    expect((await GET(new Request(`https://app.strelva.test/api/workspace/agent-connections?workspaceId=${workspace}`))).status).toBe(403);
  });
  it('disconnects by connection ID with a same-origin verified owner session', async () => {
    f.rpc.mockResolvedValue({ data: true, error: null });
    const result = await DELETE(remove(), context);
    expect(await result.json()).toEqual({ disconnected: true });
    expect(f.rpc).toHaveBeenCalledWith('disconnect_agent_oauth_connection', expect.objectContaining({ p_connection_id: connection, p_workspace_id: workspace }));
  });
  it('rejects missing or foreign origins before resolving the owner', async () => {
    for (const origin of [null, 'https://evil.test']) expect((await DELETE(remove(undefined, origin), context)).status).toBe(403);
    expect(f.session).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled();
  });
  it('rejects raw bearers, malformed connections and cross-business denial', async () => {
    expect((await DELETE(remove({ workspaceId: workspace, token: 'a'.repeat(43) }), context)).status).toBe(400);
    expect((await DELETE(remove(), { params: Promise.resolve({ connectionId: 'not-a-uuid' }) })).status).toBe(400);
    expect(f.rpc).not.toHaveBeenCalled();
    f.rpc.mockResolvedValue({ data: null, error: { message: 'workspace_access_denied' } });
    expect((await DELETE(remove(), context)).status).toBe(403);
  });
  it('reports storage outages as unavailable rather than a permission denial', async () => {
    f.rpc.mockResolvedValue({ data: null, error: { message: 'temporarily_unavailable' } });
    expect((await GET(new Request(`https://app.strelva.test/api/workspace/agent-connections?workspaceId=${workspace}`))).status).toBe(503);
    expect((await DELETE(remove(), context)).status).toBe(503);
  });

});
