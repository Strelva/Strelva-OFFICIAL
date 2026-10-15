import { encryptSecret } from "@/platform/infra/crypto/secrets";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import type { AppEventDeliveriesView, AppEventEndpointView, AppEventsCommand } from "./contracts";
import { appEventWebhooksEnabled } from "./release";
import * as defaultStore from "./store";
import { newWebhookSecret, validateWebhookUrl } from "./webhooks";

const UNREADABLE = "Events could not be read. Nothing changed.";

/** Thrown when a Webhook command needs the Webhooks switch and it is off. The route answers 503. */
export class WebhooksOffError extends WorkspaceStoreError {
  constructor() {
    super("Webhooks are not turned on.");
    this.name = "WebhooksOffError";
  }
}

export interface CommandDeps {
  store: Pick<typeof defaultStore, "retryDeadLetter" | "createWebhookEndpoint" | "setWebhookEndpoint">;
  webhooksOn: boolean;
  validateUrl: (url: string) => Promise<string>;
  newSecret: () => { secret: string; hint: string };
  encrypt: (plaintext: string) => string;
}

const defaultDeps = (): CommandDeps => ({
  store: defaultStore,
  webhooksOn: appEventWebhooksEnabled(),
  validateUrl: (url) => validateWebhookUrl(url),
  newSecret: newWebhookSecret,
  encrypt: (plaintext) => encryptSecret(plaintext),
});

export async function readAppEventDeliveries(actor: WorkspaceActor, scope: { workspaceId: string; agencyWorkspaceId?: string | null }): Promise<AppEventDeliveriesView> {
  const view = await defaultStore.readDeliveries(actor, scope);
  if (view.workspaceId !== scope.workspaceId) throw new WorkspaceStoreError(UNREADABLE);
  return view;
}

export type AppEventCommandResult =
  | { view: AppEventDeliveriesView }
  | { view: AppEventEndpointView; secret?: string };

/** A sealed secret: when the platform key is missing the secret would be kept in the clear, so refuse. */
function seal(deps: CommandDeps, secret: string): string {
  const sealed = deps.encrypt(secret);
  if (!sealed.startsWith("enc:v1:")) throw new WorkspaceStoreError("Webhooks could not be set up. Nothing changed.");
  return sealed;
}

/**
 * Run one command from the business or agency screen. Who may do it is decided in SQL;
 * this only passes the session's identity and the exact scope. A new secret is returned
 * here once and never read back.
 */
export async function runAppEventCommand(actor: WorkspaceActor, command: AppEventsCommand, deps: CommandDeps = defaultDeps()): Promise<AppEventCommandResult> {
  const scope = { workspaceId: command.workspaceId, agencyWorkspaceId: command.agencyWorkspaceId ?? null };
  switch (command.action) {
    case "retry":
      return { view: await deps.store.retryDeadLetter(actor, scope, command.deadLetterId) };
    case "create_webhook": {
      if (!deps.webhooksOn) throw new WebhooksOffError();
      const url = await deps.validateUrl(command.url);
      const { secret, hint } = deps.newSecret();
      const view = await deps.store.createWebhookEndpoint(actor, scope, {
        url, eventTypes: command.eventTypes, secretCiphertext: seal(deps, secret), secretHint: hint,
      });
      return { view, secret };
    }
    case "set_webhook": {
      // Pausing and turning off always work, even with the switch off, so a person can stop delivery.
      if (command.status === "active" && !deps.webhooksOn) throw new WebhooksOffError();
      return { view: await deps.store.setWebhookEndpoint(actor, scope, { endpointId: command.endpointId, status: command.status }) };
    }
    case "rotate_webhook_secret": {
      if (!deps.webhooksOn) throw new WebhooksOffError();
      const { secret, hint } = deps.newSecret();
      const view = await deps.store.setWebhookEndpoint(actor, scope, {
        endpointId: command.endpointId, status: null, secretCiphertext: seal(deps, secret), secretHint: hint,
      });
      return { view, secret };
    }
  }
}

export async function readOperatorAppEventDeliveries(operatorEmail: string, workspaceId: string): Promise<AppEventDeliveriesView> {
  const view = await defaultStore.readOperatorDeliveries(operatorEmail, workspaceId);
  if (view.workspaceId !== workspaceId) throw new WorkspaceStoreError(UNREADABLE);
  return view;
}

export function operatorRetryAppEvent(operatorEmail: string, deadLetterId: string): Promise<AppEventDeliveriesView> {
  return defaultStore.operatorRetryDeadLetter(operatorEmail, deadLetterId);
}
