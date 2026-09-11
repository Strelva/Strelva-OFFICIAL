/** Exposure only. Every inquiry read and command still requires tenant authority. */
export function inquiryReleaseEnabled(environment: { STRELVA_INQUIRIES_RELEASE?: string } = { STRELVA_INQUIRIES_RELEASE: process.env.STRELVA_INQUIRIES_RELEASE }): boolean {
  return environment.STRELVA_INQUIRIES_RELEASE === "1";
}
