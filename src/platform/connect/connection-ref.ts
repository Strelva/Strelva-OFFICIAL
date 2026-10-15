/** A reconnect advances generation; old holder receipts cannot identify a new account. */
export function stripeConnectionRef(workspaceId: string, generation: number): string {
  return `stripe:${workspaceId}:${generation}`;
}
