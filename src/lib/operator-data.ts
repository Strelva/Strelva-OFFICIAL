/**
 * Operator reads may degrade so the command center remains usable during a
 * partial outage, but an empty fallback must never masquerade as verified
 * emptiness. Carry availability beside the data so surfaces can disclose that
 * their counts are incomplete.
 */
export interface OperatorDataRead<T> {
  data: T;
  available: boolean;
  source: string;
}

export async function readOperatorData<T>(
  source: string,
  read: () => Promise<T>,
  fallback: T,
): Promise<OperatorDataRead<T>> {
  try {
    return { data: await read(), available: true, source };
  } catch (error) {
    console.error(
      `[operator-data] ${source} unavailable:`,
      error instanceof Error ? error.message : error,
    );
    return { data: fallback, available: false, source };
  }
}
