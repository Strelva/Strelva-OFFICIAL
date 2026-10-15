import { MoneyDocumentPage, moneyDocumentMetadata } from "../../money-document-page";

export const metadata = moneyDocumentMetadata;
export const dynamic = "force-dynamic";
export default async function InvoicePage(props: { params: Promise<{ linkId: string }>; searchParams: Promise<{ workspaceId?: string }> }) {
  return MoneyDocumentPage({ kind: "invoice", ...props });
}
