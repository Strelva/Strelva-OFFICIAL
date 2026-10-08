import { z } from "zod";

/** The browser can only say that a business schema is present. */
export const platformSchemaHintSchema = z.object({ present: z.literal(true) }).strict();
