import { promises as fs } from "fs";
import path from "path";

export interface PendingSms {
  tenantId: string;
  suggestionId: string;
  suggestionText: string;
  actionPrompt: string;
  sentAt: string;
  phone: string;
  status: "waiting" | "approved" | "declined" | "expired";
}

const DEV_PATH = path.join(process.cwd(), "dev-sms-pending.json");

async function read(): Promise<Record<string, PendingSms>> {
  try {
    const raw = await fs.readFile(DEV_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function write(data: Record<string, PendingSms>): Promise<void> {
  await fs.writeFile(DEV_PATH, JSON.stringify(data, null, 2));
}

export async function setPending(pending: PendingSms): Promise<void> {
  const store = await read();
  store[pending.tenantId] = pending;
  await write(store);
}

export async function getPendingByPhone(
  phone: string
): Promise<PendingSms | null> {
  const store = await read();
  const normalized = phone.replace(/\s/g, "");
  for (const entry of Object.values(store)) {
    if (entry.phone === normalized && entry.status === "waiting") {
      return entry;
    }
  }
  return null;
}

export async function clearPending(
  tenantId: string,
  status: "approved" | "declined" | "expired"
): Promise<void> {
  const store = await read();
  if (store[tenantId]) {
    store[tenantId].status = status;
    await write(store);
  }
}
