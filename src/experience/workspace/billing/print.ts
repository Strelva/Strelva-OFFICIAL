/** Print keeps the document and drops the page header, the side rail and anything marked data-print-hide, so a saved PDF is the document alone. Shared by every printable document. */
export const DOCUMENT_PRINT_CSS = "@media print { main > header, nav, aside, [data-print-hide] { display: none !important; } }";
