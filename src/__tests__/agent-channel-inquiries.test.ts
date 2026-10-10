import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { receiveAgentInquiry, agentInquiryStatus } from '@/platform/agent-channel/inquiries';
import { setInquiryRecordsDb } from '@/platform/infra/inquiry-records';
import { decryptSecret } from '@/platform/infra/crypto/secrets';
const rpc = vi.fn();
const scope = 'workspace:ac161100-0000-4000-8000-000000000010';
const body = { requestId: 'fixture-request-1', agent: { name: 'Fixture Assistant' }, customer: { name: 'Dana Reed', email: 'dana@example.test' }, message: 'Please review our proposal.' };
beforeEach(() => { vi.stubEnv('STRELVA_AGENT_INQUIRIES', '1'); vi.stubEnv('SECRETS_ENC_KEY', 'local-fixture-key'); setInquiryRecordsDb({ rpc }); rpc.mockReset(); rpc.mockImplementation(async (name, args) => ({ error: null, data: name === 'receive_agent_inquiry' ? { inquiryId: 'ac161100-0000-4000-8000-000000000050', statusCiphertext: args.p_status_ciphertext, replyBy: null, expiresAt: '2026-11-07T00:00:00Z' } : null })); });
afterEach(() => { setInquiryRecordsDb(undefined); vi.unstubAllEnvs(); });
describe('native agent inquiry adapter', () => {
    it('uses explicit origin and agent fields with encrypted replayable status capability', async () => { const r = await receiveAgentInquiry(scope, body); const args = rpc.mock.calls[0]?.[1]; expect(args.p_input).toMatchObject({ origin: 'agent', type: 'inquiry', agent: { name: 'Fixture Assistant' } }); expect(args.p_input).not.toHaveProperty('source'); expect(args.p_status_ciphertext).toMatch(/^enc:v1:/); expect(decryptSecret(args.p_status_ciphertext)).toBe(r.statusToken); expect(r).not.toHaveProperty('customer'); });
    it('binds quote structure and leaves pricing to the owner', async () => { const r = await receiveAgentInquiry(scope, { ...body, serviceId: 'service-1', fields: { scope: 'Review draft', area: 'Buffalo' } }, true); expect(r.priceStatus).toBe('awaiting_owner'); expect(r.replyBy).toBeNull(); await expect(receiveAgentInquiry(scope, { ...body, serviceId: 'service-1', fields: { scope: 'Review draft' } }, true)).rejects.toThrow(); });
    it('routes disposable email into the same held state without revealing moderation', async () => { const r = await receiveAgentInquiry(scope, { ...body, customer: { ...body.customer, email: 'dana@mailinator.com' } }); expect(r.status).toBe('received'); expect(rpc.mock.calls[0]?.[1].p_spam_reason).toBe('disposable_email'); });
    it('refuses missing encryption or disabled release before persistence', async () => { vi.stubEnv('SECRETS_ENC_KEY', ''); await expect(receiveAgentInquiry(scope, body)).rejects.toThrow(); expect(rpc).not.toHaveBeenCalled(); });
    it('does not reinterpret persistence failure as accepted capture', async () => { rpc.mockResolvedValue({ data: null, error: { message: 'agent_inquiry_limit' } }); await expect(receiveAgentInquiry(scope, body)).rejects.toThrow(); });
    it('status requires capability format and treats expired/cross-business tokens alike', async () => { await expect(agentInquiryStatus(scope, 'invalid')).rejects.toThrow('Request not found'); expect(rpc).not.toHaveBeenCalled(); await expect(agentInquiryStatus(scope, 'a'.repeat(43))).rejects.toThrow('Request not found'); expect(rpc).toHaveBeenCalledWith('read_agent_inquiry_status', expect.objectContaining({ p_scope: scope, p_status_hash: expect.stringMatching(/^[a-f0-9]{64}$/) })); });
});
