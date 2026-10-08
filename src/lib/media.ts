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
