import { createHmac, timingSafeEqual } from "node:crypto";
import { CustomerCursorError, CustomerStoreError } from "./errors";

const CURSOR_VERSION = 1;
const MAX_CURSOR_BYTES = 1024;

type CursorPayload = {
  v: number;
  organizationId: string;
  userId: string;
  query: string;
  lastName: string;
  lastId: string;
};

function secret(value?: string): string {
  const configured =
    value?.trim() ||
    process.env.STRELVA_CUSTOMERS_CURSOR_SECRET?.trim() ||
    // The service-role key is already server-only and stable across instances;
    // a dedicated cursor secret is preferred so it can rotate independently.
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!configured) throw new CustomerStoreError();
  return configured;
}

function encodePart(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodePart(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signature(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function encodeCustomerCursor(
  payload: Omit<CursorPayload, "v">,
  cursorSecret?: string,
): string {
  const body = encodePart(JSON.stringify({ v: CURSOR_VERSION, ...payload }));
  return `${body}.${signature(body, secret(cursorSecret))}`;
}

export function decodeCustomerCursor(value: string, cursorSecret?: string): CursorPayload {
  if (!value || value.length > MAX_CURSOR_BYTES) throw new CustomerCursorError();
  const parts = value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new CustomerCursorError();
  const [body, suppliedSignature] = parts;
  const expected = signature(body, secret(cursorSecret));
  const suppliedBytes = Buffer.from(suppliedSignature, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    throw new CustomerCursorError();
  }

  try {
    const parsed = JSON.parse(decodePart(body)) as Partial<CursorPayload>;
    if (
      parsed.v !== CURSOR_VERSION ||
      typeof parsed.organizationId !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.query !== "string" ||
      typeof parsed.lastName !== "string" ||
      typeof parsed.lastId !== "string" ||
      !parsed.organizationId ||
      !parsed.userId ||
      !parsed.lastId
    ) {
      throw new CustomerCursorError();
    }
    return parsed as CursorPayload;
  } catch (error) {
    if (error instanceof CustomerCursorError) throw error;
    throw new CustomerCursorError();
  }
}
