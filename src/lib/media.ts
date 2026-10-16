export type { MediaAsset } from "@/platform/infra/media/contracts";

/**
 * Format bytes into a human-readable string.
 * Examples: "245 KB", "1.2 MB", "500 B"
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);

/**
 * A photo's caption in the owner's words, from its file name: "Dr. Lin at
 * work.jpg" keeps the words as typed ("Dr. Lin at work"), and a slugged name
 * reads in title case, so names keep their capitals: "dr-lin-at-work.webp"
 * reads "Dr Lin at Work". Camera names (IMG_2034, PXL_…, DSC0001) carry no
 * words, so they read "Photo".
 */
export function photoCaption(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]{2,5}$/i, "").trim();
  if (!base || /^(img|dsc|dscn|pxl|photo|image|screenshot|scan)[\s_-]*[\d_-]*$/i.test(base) || /^[\d_-]+$/.test(base)) return "Photo";
  if (/[\s.]/.test(base) && !/[_-]/.test(base)) return base.charAt(0).toUpperCase() + base.slice(1);
  return base.replace(/[_-]+/g, " ").trim().split(/\s+/)
    .map((word, index) => index > 0 && SMALL_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
