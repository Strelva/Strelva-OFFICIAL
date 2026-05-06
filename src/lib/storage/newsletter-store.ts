/**
 * Newsletter subscriber storage.
 */

import path from "path";
import { getSanityClient } from "../sanity";
import { hasSanity, DEFAULT_TENANT, readDevFile, writeDevFile } from "./core";

export interface NewsletterSubscriber {
  email: string;
  name?: string;
  subscribedAt: string;
  status: "active" | "unsubscribed";
}

const DEV_NEWSLETTER_PATH = path.join(process.cwd(), "dev-newsletter.json");

async function readDevNewsletter(): Promise<Record<string, NewsletterSubscriber[]>> {
  return readDevFile(DEV_NEWSLETTER_PATH, {});
}

async function writeDevNewsletter(data: Record<string, NewsletterSubscriber[]>): Promise<void> {
  return writeDevFile(DEV_NEWSLETTER_PATH, data);
}

export async function addSubscriber(
  email: string,
  name?: string,
  tenant: string = DEFAULT_TENANT
): Promise<{ duplicate: boolean }> {
  if (hasSanity) {
    const existing = await getSanityClient().fetch(
      `*[_type == "newsletterSubscriber" && tenant == $tenant && email == $email][0]._id`,
      { tenant, email }
    );
    if (existing) {
      // Re-activate if previously unsubscribed
      await getSanityClient().patch(existing).set({ status: "active" }).commit();
      return { duplicate: true };
    }
    await getSanityClient().create({
      _type: "newsletterSubscriber",
      tenant,
      email,
      name: name || undefined,
      subscribedAt: new Date().toISOString(),
      status: "active",
    });
    return { duplicate: false };
  }

  const store = await readDevNewsletter();
  const subscribers = store[tenant] || [];
  const existing = subscribers.find((s) => s.email === email);
  if (existing) {
    existing.status = "active";
    store[tenant] = subscribers;
    await writeDevNewsletter(store);
    return { duplicate: true };
  }
  subscribers.push({
    email,
    name: name || undefined,
    subscribedAt: new Date().toISOString(),
    status: "active",
  });
  store[tenant] = subscribers;
  await writeDevNewsletter(store);
  return { duplicate: false };
}

export async function getSubscribers(
  tenant: string = DEFAULT_TENANT
): Promise<NewsletterSubscriber[]> {
  if (hasSanity) {
    return getSanityClient().fetch(
      `*[_type == "newsletterSubscriber" && tenant == $tenant] | order(subscribedAt desc) { email, name, subscribedAt, status }`,
      { tenant }
    );
  }

  const store = await readDevNewsletter();
  return (store[tenant] || []).filter((s) => s.status === "active");
}
