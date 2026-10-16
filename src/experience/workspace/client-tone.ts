/**
 * Per-client tones for places that only know a name (the scope switcher's
 * own business list). Same palette as clientColor, so a business reads as
 * one colour family everywhere; keyed by the name it shows. Stable; no meaning.
 */
import { clientColor } from "@/platform/presentation/client-color";

export function clientTone(name: string): string {
  return clientColor(name.trim().toLowerCase());
}
