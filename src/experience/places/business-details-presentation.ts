export function recordSource(source: string | undefined): string {
  return source === "owner" ? "You said" : source === "tenant_import" ? "From your website" : source === "operator" ? "Strelva support" : source === "agency" ? "From your agency" : source ? "Recorded by Strelva" : "Not recorded";
}

