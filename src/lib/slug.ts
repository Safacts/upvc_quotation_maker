export function slugify(s: string): string {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

import { supaGet } from "./supabase";
import { unstable_cache } from "next/cache";

export const getCachedClients = unstable_cache(
  async () => {
    return await supaGet("client_public", { select: "id,config,is_active,created_at,updated_at" });
  },
  ['client-public-list'],
  { revalidate: 300 } // cache for 5 minutes
);

export interface ClientRow {
  id: string;
  config?: Record<string, any> | null;
  is_active?: boolean;
  password_hash?: string;
  trial_expires_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export function clientMatchesSlug(row: ClientRow, slug: string): boolean {
  const cfg = row.config || {};
  const candidates = [
    row.id,
    cfg.appName,
    cfg.companyName,
  ];
  return candidates.some((c) => slugify(String(c || "")) === slug);
}

export function findClientBySlug(rows: ClientRow[], slug: string): ClientRow | null {
  const s = slugify(slug);
  if (!s) return null;
  return rows.find((r) => clientMatchesSlug(r, s)) || null;
}

export function clientToSlug(row: ClientRow, key: "id" | "appName" | "companyName"): string {
  const cfg = row.config || {};
  const raw = key === "id" ? row.id : String(cfg[key] || row.id);
  return slugify(raw);
}
