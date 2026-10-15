/**
 * STRELVA_ONE_QUEUE (off by default). On, an agency's Queue lists its clients'
 * Strelva reviews drafts, Requests waiting for its acceptance and its clients'
 * site work, and /admin/queue stops listing client work that an agency holds.
 * Off, both queues read exactly as before.
 */
export function oneQueueEnabled(): boolean {
  return process.env.STRELVA_ONE_QUEUE === "1";
}
