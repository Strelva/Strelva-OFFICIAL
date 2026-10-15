import { MoneyDocumentPage, moneyDocumentMetadata } from "../../money-document-page";

export const metadata = moneyDocumentMetadata;
export const dynamic = "force-dynamic";
export default async function ReceiptPage(props: { params: Promise<{ linkId: string }>; searchParams: Promise<{ workspaceId?: string }> }) {
  return MoneyDocumentPage({ kind: "payment_receipt", ...props });
}
