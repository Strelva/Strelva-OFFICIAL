/** The native publication committed; later bookkeeping must never invite another write. */
export class WebsitePublicationAcceptedError extends Error {
  constructor(readonly workId: string, readonly receiptId: string) {
    super("The website was published. Its remaining confirmation could not be saved.");
    this.name = "WebsitePublicationAcceptedError";
  }
}
