/** A page's address as an owner says it: "/" is the home page, "/new-patients" is "New patients". Never a raw path. */
export function pageName(path: string): string {
  const clean = path.split(/[?#]/)[0]!.replace(/\/+$/, "");
  if (!clean || clean === "/") return "Home page";
  const last = clean.split("/").filter(Boolean).pop() ?? clean;
  const words = decodeURIComponent(last).replace(/[-_]+/g, " ").replace(/\.\w+$/, "").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "A page";
}
