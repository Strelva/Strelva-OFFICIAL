/**
 * Search Console data storage.
 */

import { promises as fs } from "fs";
import path from "path";
import type { SearchData } from "../types";
import { getSanityClient, getSanityReadClient } from "../sanity";
import { hasSanity } from "./core";

export async function getSearchData(tenant: string): Promise<SearchData | null> {
  if (hasSanity) {
    const doc = await getSanityReadClient().fetch(
      `*[_type == "searchData" && tenant == $tenant][0]`,
      { tenant },
    );
    if (!doc) return null;
    const { _id, _rev, _type, _createdAt, _updatedAt, tenant: _, ...data } = doc;
    return data as SearchData;
  }

  try {
    const raw = await fs.readFile(path.join(process.cwd(), `dev-search-${tenant}.json`), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setSearchData(tenant: string, data: SearchData): Promise<void> {
  if (hasSanity) {
    const query = `*[_type == "searchData" && tenant == $tenant][0]._id`;
    const existingId = await getSanityClient().fetch(query, { tenant });
    const doc = { _type: "searchData" as const, tenant, ...data };
    if (existingId) {
      await getSanityClient().patch(existingId).set(doc).commit();
    } else {
      await getSanityClient().create(doc);
    }
    return;
  }

  await fs.writeFile(
    path.join(process.cwd(), `dev-search-${tenant}.json`),
    JSON.stringify(data, null, 2),
  );
}
