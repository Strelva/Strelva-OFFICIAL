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

/**
 * A photo's caption in the owner's words, from its file name: "Dr. Lin at
 * work.jpg" reads "Dr. Lin at work", "front-door_elmwood.webp" reads
 * "Front door elmwood". Camera names (IMG_2034, PXL_…, DSC0001) carry no words,
 * so they read "Photo".
 */
export function photoCaption(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]{2,5}$/i, "").trim();
  if (!base || /^(img|dsc|dscn|pxl|photo|image|screenshot|scan)[\s_-]*[\d_-]*$/i.test(base) || /^[\d_-]+$/.test(base)) return "Photo";
  const words = /[\s.]/.test(base) && !/[_-]/.test(base) ? base : base.replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
