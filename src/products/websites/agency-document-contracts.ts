/** These native section keys also govern the SQL agency document CAS. Unknown
 * catalog types have no delegated editing authority. */
export const AGENCY_DOCUMENT_NODE_SECTIONS: Readonly<Record<string,string>> = {
 Header:"navigation",Footer:"footer",Hero:"hero",Story:"story",ServiceGrid:"services",ServiceDetail:"services",Testimonials:"testimonials",Faq:"faq",Hours:"contact",Locations:"contact",Map:"contact",Booking:"contact",InquiryForm:"contact",
};
export const AGENCY_DOCUMENT_SECTIONS = ["navigation","footer","hero","story","services","testimonials","faq","contact"] as const;
