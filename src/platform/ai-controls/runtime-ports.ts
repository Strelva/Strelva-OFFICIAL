/** Registration must not evaluate src/lib review code. */
type AutoPostWithdrawal = (tenantId: string, input: { by: "agency" | "operator" }) => Promise<number>;

let autoPostWithdrawal: AutoPostWithdrawal | null = null;

/** The app edge supplies a lazy callback; the controls service retrieves it at use. */
export function registerAutoPostWithdrawal(withdraw: AutoPostWithdrawal): void { autoPostWithdrawal = withdraw; }
export function getAutoPostWithdrawal(): AutoPostWithdrawal | null { return autoPostWithdrawal; }
