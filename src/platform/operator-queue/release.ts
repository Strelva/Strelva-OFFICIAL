/** Portfolio-wide operator rollout. Unset, 0 and typos retain the old admin.
 * Independent of the website rebuild; no customer sends are enabled here. */
export function operatorQueueReleaseEnabled(environment: { STRELVA_OPERATOR_QUEUE_RELEASE?: string } = { STRELVA_OPERATOR_QUEUE_RELEASE: process.env.STRELVA_OPERATOR_QUEUE_RELEASE }): boolean {
  return environment.STRELVA_OPERATOR_QUEUE_RELEASE === "1";
}
