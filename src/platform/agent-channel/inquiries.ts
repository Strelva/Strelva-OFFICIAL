/** Public intake uses the same native record and held-spam state as the workspace. */
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { encryptSecret, decryptSecret } from '@/platform/infra/crypto/secrets';
import { scoreLeadSpam } from '@/platform/infra/lead-spam';
import { inquiryRecordsRpc } from '@/platform/infra/inquiry-records';
import { PublicBookingError } from '@/platform/bookings/errors';
import { isDisposableEmail } from './limits';
import { tokenHash } from '@/platform/bookings/native';
const customer = z.object({ name: z.string().trim().min(1).max(160), email: z.string().trim().email().max(320) }).strict();
export const inquiryInput = z.object({ requestId: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/), agent: z.object({ name: z.string().trim().min(1).max(120) }).strict(), customer, message: z.string().trim().min(1).max(5000) }).strict();
export const quoteInput = inquiryInput.extend({ serviceId: z.string().min(1).max(200), fields: z.object({ scope: z.string().trim().min(1).max(2000), area: z.string().trim().min(1).max(500) }).strict() }).strict();
function ready() { if (process.env.STRELVA_AGENT_INQUIRIES !== '1' || !process.env.SECRETS_ENC_KEY)
    throw new PublicBookingError('unavailable', 'Agent inquiries are not enabled.'); }
export async function receiveAgentInquiry(scope: string, raw: unknown, quote = false) {
    ready();
    const input = quote ? quoteInput.parse(raw) : inquiryInput.parse(raw);
    const spam = scoreLeadSpam({ businessName: input.customer.name, description: input.message, email: input.customer.email });
    const reason = isDisposableEmail(input.customer.email) ? 'disposable_email' : spam.isSpam ? spam.signals.join(',') || 'content_score' : null;
    const body = { ...input, origin: 'agent', type: quote ? 'quote' : 'inquiry' };
    const digest = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const token = randomBytes(32).toString('base64url');
    const receipt = z.object({ inquiryId: z.string().uuid(), statusCiphertext: z.string(), replyBy: z.string().nullable(), expiresAt: z.string() }).parse(await inquiryRecordsRpc('receive_agent_inquiry', { p_scope: scope, p_input: body, p_digest: digest, p_status_hash: tokenHash(token), p_status_ciphertext: encryptSecret(token), p_spam_reason: reason }));
    // SQL binds requestId to its entire payload and returns the original capability on replay.
    return { inquiryId: receipt.inquiryId, status: 'received', statusToken: decryptSecret(receipt.statusCiphertext), replyBy: receipt.replyBy, expiresAt: receipt.expiresAt, priceStatus: quote ? 'awaiting_owner' : undefined };
}
export async function agentInquiryStatus(scope: string, token: unknown) {
    ready();
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token))
        throw new PublicBookingError('not_found', 'Request not found.');
    const result = await inquiryRecordsRpc('read_agent_inquiry_status', { p_scope: scope, p_status_hash: tokenHash(token) });
    if (!result)
        throw new PublicBookingError('not_found', 'Request not found.');
    return result;
}
