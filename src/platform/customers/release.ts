/** IMP-05 / OPS-05: independent Enterprise Customers exposure gate. */
export function customersReleaseEnabled(): boolean {
  return process.env.STRELVA_CUSTOMERS_RELEASE === "1";
}
