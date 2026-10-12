import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext } from '@playwright/test';
import { localEnvironment } from './local-auth';
import type { CustomerPerson } from './ordinary-agency-maker';

/** Actual owner-issued exact assignment and named draft grant after first publication.
 * This grants no customer membership, publication or customer record write authority. */
export async function grantOrdinaryAgencyAppDraft(owner: CustomerPerson, maker: CustomerPerson & { agencyId: string }, businessId: string, app: { id: string; payload: { designRevision: number } }) {
  async function post(request: APIRequestContext, path: string, data: unknown, status = 200) {
    const response = await request.post(path, { headers: { origin: localEnvironment().app }, data });
    expect(response.status(), await response.text()).toBe(status);
    return response.json();
  }
  const responsibility = await post(owner.context.request, '/api/operations', { action: 'create', workspaceId: businessId,
    input: { title: 'Review this exact installed app', intent: 'Return a checked draft to the customer; publication and records stay with them.',
      steps: [{ id: 'check-app', operation: 'application.command', workId: app.id,
        input: { kind: 'rehearse', expectedDesignRevision: app.payload.designRevision }, maximumCents: 0, capabilityVersion: 1 }] } });
  await post(owner.context.request, '/api/operations', { action: 'command', workId: responsibility.id,
    command: { kind: 'approve', expectedRevision: responsibility.payload.revision } });
  const installation = await post(owner.context.request, '/api/offerings', { action: 'install', businessId,
    definitionId: 'private_staff_requests', definitionVersion: '1.0.0', idempotencyKey: randomUUID(), configuration: {},
    nativeResources: [{ kind: 'application', id: app.id }], acceptedScope: ['submit_requests', 'review_requests'],
    surfaceIds: ['staff_app', 'business_workspace'], responsibility: { kind: 'provider_requested', providerKind: 'agency',
      providerName: 'Selected ordinary agency', agencyWorkspaceId: maker.agencyId, requestNote: 'Prepare the exact draft for owner review.' } });
  const assignment = await post(owner.context.request, '/api/operational-assignments', { action: 'offer', workId: responsibility.id,
    assignment: { assigneeEmail: maker.email, assigneeKind: 'agency', agencyWorkspaceId: maker.agencyId,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(), idempotencyKey: randomUUID() } }, 201);
  const requested = await post(owner.context.request, '/api/offerings/provider-delivery', { action: 'request', businessId,
    installationId: installation.installation.id, assignmentId: assignment.id, idempotencyKey: randomUUID() });
  const delivery = requested.delivery;
  await post(maker.context.request, '/api/offerings/provider-delivery', { action: 'accept', deliveryId: delivery.id });
  const granted = await post(owner.context.request, '/api/agency-application-draft-access', { action: 'grant', deliveryId: delivery.id, workId: app.id }, 201);
  return { grantId: granted.grant.id as string, deliveryId: delivery.id as string, assignmentId: assignment.id as string };
}
