/** Largest private onboarding file the server will store. */
export const MAX_ONBOARDING_FILE_BYTES = 2_000_000;
/** Multipart envelope allowance: boundaries, field headers, and the three ids. */
export const MAX_ONBOARDING_UPLOAD_REQUEST_BYTES = MAX_ONBOARDING_FILE_BYTES + 64 * 1024;
