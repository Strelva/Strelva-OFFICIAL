/** OAuth2.1 public clients: CIMD, S256, exact resource, rotating renewable business-bound grants. */
import { createHash, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { z } from 'zod';
import { pinnedRequestOptions, isPublicIPv4Address } from '@/platform/infra/pinned-lookup';
import { getSupabase } from '@/platform/infra/db/client';
import type { WorkspaceActor } from '@/platform/workspaces/types';
export const MCP_SCOPES = ['business:read', 'website:read', 'website:propose', 'inquiries:read', 'quotes:approve'] as const;
export const hash = (v: string) => createHash('sha256').update(v).digest('hex');
export const pkce = (v: string) => createHash('sha256').update(v, 'ascii').digest('base64url');
export const oauthEnabled = () => process.env.STRELVA_MCP_OAUTH === '1' && process.env.STRELVA_WORKSPACE_RELEASE === '1';
export function oauthOrigin() { const u = new URL(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://app.strelva.com'); return u.origin; }
export const resourceUrl = (origin = oauthOrigin()) => `${origin}/api/mcp/public`;
export function protectedMetadata() { return { resource: resourceUrl(), authorization_servers: [oauthOrigin()], scopes_supported: ['business:read', 'website:read', 'website:propose'], bearer_methods_supported: ['header'] }; }
export function authorizationMetadata() { const origin = oauthOrigin(); return { issuer: origin, authorization_endpoint: `${origin}/connect/authorize`, token_endpoint: `${origin}/api/mcp/oauth/token`, revocation_endpoint: `${origin}/api/mcp/oauth/revoke`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'], client_id_metadata_document_supported: true, authorization_response_iss_parameter_supported: true, scopes_supported: MCP_SCOPES }; }
export const publicIPv4 = isPublicIPv4Address;
export function validRedirect(value: string) { try {
    const u = new URL(value);
    return !u.username && !u.password && !u.hash && value.length <= 2000 && (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)));
}
catch {
    return false;
} }
export const clientMetadataSchema = z.object({ client_id: z.string().url(), client_name: z.string().trim().min(1).max(120), redirect_uris: z.array(z.string().refine(validRedirect)).min(1).max(10), token_endpoint_auth_method: z.literal('none'), grant_types: z.array(z.enum(['authorization_code', 'refresh_token'])).min(1).optional(), response_types: z.array(z.literal('code')).optional() });
export function cimdUrl(value: string) { const u = new URL(value); if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.search || !u.pathname || u.pathname === '/' || u.hostname === 'localhost' || u.hostname.endsWith('.localhost') || u.hostname.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) && !publicIPv4(u.hostname))
    throw new Error('invalid_client'); return u; }
/** No redirects. Resolve all IPv4 answers, reject any private target, pin the chosen socket. */
export async function fetchCimd(clientId: string) {
    const u = cimdUrl(clientId);
    let expired = false;
    let active: ReturnType<typeof httpsRequest> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([(async () => {
                const answers = await lookup(u.hostname, { family: 4, all: true });
                if (expired || !answers.length || answers.some(a => !publicIPv4(a.address)))
                    throw new Error('invalid_client');
                const body = await new Promise<string>((resolve, reject) => {
                    active = httpsRequest(u, { ...pinnedRequestOptions(answers[0]!.address), headers: { Accept: 'application/json', 'Accept-Encoding': 'identity' } }, r => {
                        if (r.statusCode !== 200 || !r.headers['content-type']?.includes('application/json')) {
                            r.resume();
                            reject(new Error('invalid_client'));
                            return;
                        }
                        let bytes = 0;
                        const chunks: Buffer[] = [];
                        r.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 16384) {
                            active?.destroy(new Error('invalid_client'));
                            return;
                        } chunks.push(chunk); });
                        r.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
                        r.on('error', reject);
                    });
                    active.on('error', reject);
                    active.end();
                });
                const metadata = clientMetadataSchema.parse(JSON.parse(body));
                if (metadata.client_id !== clientId)
                    throw new Error('invalid_client');
                return metadata;
            })(), new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; active?.destroy(new Error('invalid_client')); reject(new Error('invalid_client')); }, 5000); })]);
    }
    finally {
        expired = true;
        if (timer)
            clearTimeout(timer);
        active?.destroy();
    }
}
type RpcDb = {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{
        data: unknown;
        error: {
            message?: string;
        } | null;
    }>;
};
export async function oauthRpc(name: string, args: Record<string, unknown>, db: RpcDb | null = getSupabase() as unknown as RpcDb | null) { if (!db)
    throw new Error('temporarily_unavailable'); const r = await db.rpc(name, args); if (r.error)
    throw new Error(r.error.message || 'temporarily_unavailable'); return r.data; }
export const authorizationSchema = z.object({ response_type: z.literal('code'), client_id: z.string().max(2000), redirect_uri: z.string().max(2000), resource: z.literal(resourceUrl()), code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code_challenge_method: z.literal('S256'), scope: z.string().max(200), state: z.string().max(1000).optional() }).strict();
export async function parseAuthorization(raw: unknown, fetcher = fetchCimd) { const p = authorizationSchema.parse(raw); const client = await fetcher(p.client_id); if (client.grant_types && !client.grant_types.includes('authorization_code')) throw new Error('invalid_client'); if (!client.redirect_uris.some(uri => redirectMatches(uri, p.redirect_uri)))
    throw new Error('invalid_redirect_uri'); const scopes = p.scope.split(' ').filter(Boolean); if (!scopes.length || scopes.some(s => !MCP_SCOPES.includes(s as typeof MCP_SCOPES[number])))
    throw new Error('invalid_scope'); return { params: p, client, scopes: [...new Set(scopes)] }; }
export async function authorizeAgent(actor: WorkspaceActor, raw: unknown, workspaceId: string, agencyId: string | null) { if (!oauthEnabled())
    throw new Error('temporarily_unavailable'); const a = await parseAuthorization(raw); const code = randomBytes(32).toString('base64url'); await oauthRpc('issue_agent_oauth_connection_code', { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_workspace_id: z.uuid().parse(workspaceId), p_agency_id: agencyId ? z.uuid().parse(agencyId) : null, p_code_hash: hash(code), p_client_id: a.params.client_id, p_client_name: a.client.client_name, p_redirect_uri: a.params.redirect_uri, p_resource: a.params.resource, p_challenge: a.params.code_challenge, p_scopes: a.scopes }); const url = new URL(a.params.redirect_uri); url.searchParams.set('code', code); if (a.params.state !== undefined)
    url.searchParams.set('state', a.params.state); url.searchParams.set('iss', oauthOrigin()); return url.toString(); }
/** Exact redirects except portless native loopback registrations (RFC 8252). */
export function redirectMatches(registered: string, requested: string) {
    if (registered === requested) return true;
    if (!validRedirect(requested)) return false;
    const allowed = new URL(registered), actual = new URL(requested);
    return allowed.protocol === 'http:' && !allowed.port
        && ['localhost', '127.0.0.1', '[::1]'].includes(allowed.hostname)
        && actual.protocol === allowed.protocol && actual.hostname === allowed.hostname
        && actual.pathname === allowed.pathname && actual.search === allowed.search;
}
const tokenResponse = z.object({ expiresIn: z.number(), scope: z.string(), workspaceId: z.uuid() });
export async function exchangeAgentCode(p: URLSearchParams) {
    if (!oauthEnabled()) throw new Error('temporarily_unavailable');
    if (['grant_type', 'client_id', 'resource'].some(k => p.getAll(k).length !== 1)
        || !p.get('client_id') || p.get('client_id')!.length > 2000 || p.get('resource') !== resourceUrl()
        || p.getAll('scope').length > 1) throw new Error('invalid_request');
    const token = randomBytes(32).toString('base64url'), refresh = randomBytes(32).toString('base64url');
    let result: unknown;
    if (p.get('grant_type') === 'authorization_code') {
        if (['redirect_uri', 'code', 'code_verifier'].some(k => p.getAll(k).length !== 1)
            || !/^[-A-Za-z0-9._~]{43,128}$/.test(p.get('code_verifier') || '')
            || !/^[A-Za-z0-9_-]{43}$/.test(p.get('code') || '')
            || !validRedirect(p.get('redirect_uri') || '')) throw new Error('invalid_grant');
        result = await oauthRpc('exchange_agent_oauth_connection_code', {
            p_code_hash: hash(p.get('code')!), p_client_id: p.get('client_id'), p_redirect_uri: p.get('redirect_uri'),
            p_resource: p.get('resource'), p_challenge: pkce(p.get('code_verifier')!),
            p_token_hash: hash(token), p_refresh_hash: hash(refresh),
        });
    } else if (p.get('grant_type') === 'refresh_token') {
        if (p.getAll('refresh_token').length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(p.get('refresh_token') || '')) throw new Error('invalid_grant');
        const scopes = p.has('scope') ? [...new Set(p.get('scope')!.split(' ').filter(Boolean))] : null;
        if (scopes && (!scopes.length || scopes.some(scope => !MCP_SCOPES.includes(scope as typeof MCP_SCOPES[number])))) throw new Error('invalid_scope');
        result = await oauthRpc('refresh_agent_oauth_connection', {
            p_refresh_hash: hash(p.get('refresh_token')!), p_client_id: p.get('client_id'), p_resource: p.get('resource'),
            p_scopes: scopes, p_token_hash: hash(token), p_next_refresh_hash: hash(refresh),
        });
        const error = z.object({ error: z.enum(['invalid_grant', 'invalid_scope']) }).safeParse(result);
        if (error.success) throw new Error(error.data.error);
    } else throw new Error('unsupported_grant_type');
    const r = tokenResponse.parse(result);
    return { access_token: token, refresh_token: refresh, token_type: 'Bearer', expires_in: r.expiresIn, scope: r.scope, business_workspace_id: r.workspaceId };
}
export async function validateAgentToken(request: Request, scope: string, workspaceId?: string) { if (!oauthEnabled())
    return null; const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') || '')?.[1]; if (!token)
    return null;
    if (workspaceId === undefined && scope !== 'business:read') {
        const principal = await inspectAgentToken(request);
        if (!principal) return null;
        workspaceId = principal.workspaceId;
    }
    const principal = workspaceId === undefined
      ? await oauthRpc('read_agent_oauth_connection', { p_token_hash: hash(token), p_resource: resourceUrl() })
      : await oauthRpc('validate_agent_oauth_token', { p_token_hash: hash(token), p_resource: resourceUrl(), p_scope: scope, p_workspace_id: workspaceId });
    return z.object({ userId: z.uuid(), verifiedEmail: z.email(), workspaceId: z.uuid(), agencyId: z.uuid().nullable() }).nullable().parse(principal); }

/** Identify a current bound grant without requiring a particular tool scope. */
export async function inspectAgentToken(request: Request, workspaceId?: string) {
    if (!oauthEnabled()) return null;
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') || '')?.[1];
    if (!token) return null;
    return z.object({ userId: z.uuid(), verifiedEmail: z.email(), workspaceId: z.uuid(), agencyId: z.uuid().nullable(), scopes: z.array(z.enum(MCP_SCOPES)) }).nullable().parse(
        await oauthRpc('read_agent_oauth_principal', { p_token_hash: hash(token), p_resource: resourceUrl(), p_workspace_id: workspaceId ?? null }),
    );
}
