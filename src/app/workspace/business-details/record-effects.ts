import { nativeChangedKeys } from "@/products/websites/server";
import { changeRecordWithGoogle } from "@/products/publishing/server";
import { createNativeWebsiteFactService, type NativeFactsPreparation } from "./native-website-facts";

/** The app composes independent downstream effects only after the durable
 * record commit. A native failure cannot overwrite a Google receipt, and
 * neither effect can turn an accepted record write into a retry. */
export async function changeRecordWithWebsiteReviews(
  ...args: Parameters<typeof changeRecordWithGoogle>
): Promise<Awaited<ReturnType<typeof changeRecordWithGoogle>> & { native?: NativeFactsPreparation; nativePropagationError?: string }> {
  return composeRecordEffects(changeRecordWithGoogle, createNativeWebsiteFactService())(...args);
}

export function composeRecordEffects(change = changeRecordWithGoogle, prepare = createNativeWebsiteFactService()) {
  return async (...args: Parameters<typeof changeRecordWithGoogle>) => {
    const result = await change(...args);
    if (process.env.STRELVA_WEBSITE_NATIVE_FACTS_ENABLED !== "1" || !result.record.changeCount) return result;
    const patch = args[3] as Parameters<typeof nativeChangedKeys>[0];
    try {
      const native = await prepare(args[0], args[1], result.record.revision, nativeChangedKeys(patch));
      return { ...result, native };
    } catch {
      return { ...result, nativePropagationError: "Your business record was saved. Website review preparation could not be confirmed; check the website review before trying again." };
    }
  };
}
