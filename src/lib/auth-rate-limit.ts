import { supaGet, supaPatch, supaPost } from "@/lib/supabase";

type Bucket = { count: number; windowStartedAt: number; lockedUntil: number };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 30 * 60 * 1000;
const MAX_FAILURES = 5;

function getMemory(key: string): Bucket {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now - current.windowStartedAt >= WINDOW_MS) {
    const fresh = { count: 0, windowStartedAt: now, lockedUntil: 0 };
    buckets.set(key, fresh);
    return fresh;
  }
  return current;
}

function parseKey(key: string): { scope: string; subject: string } {
  const firstColon = key.indexOf(":");
  const scope = firstColon >= 0 ? key.slice(0, firstColon) : key;
  return { scope, subject: key };
}

async function getDbBucket(key: string): Promise<Bucket | null> {
  if (process.env.NODE_ENV === "test" || (globalThis as any).vitest) return null;
  try {
    const { scope, subject } = parseKey(key);
    const rows = await supaGet("auth_rate_limits", {
      subject: "eq." + subject,
      scope: "eq." + scope,
      select: "failure_count,window_started_at,locked_until",
      limit: 1,
    });
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const r = rows[0];
    return {
      count: Number(r.failure_count) || 0,
      windowStartedAt: r.window_started_at ? new Date(r.window_started_at).getTime() : Date.now(),
      lockedUntil: r.locked_until ? new Date(r.locked_until).getTime() : 0,
    };
  } catch {
    return null;
  }
}

async function upsertDbBucket(key: string, bucket: Bucket): Promise<void> {
  if (process.env.NODE_ENV === "test" || (globalThis as any).vitest) return;
  try {
    const { scope, subject } = parseKey(key);
    const payload = {
      subject,
      scope,
      failure_count: bucket.count,
      window_started_at: new Date(bucket.windowStartedAt).toISOString(),
      locked_until: bucket.lockedUntil ? new Date(bucket.lockedUntil).toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    const existing = await supaGet("auth_rate_limits", {
      subject: "eq." + subject,
      scope: "eq." + scope,
      select: "subject",
      limit: 1,
    });
    if (Array.isArray(existing) && existing.length > 0) {
      await supaPatch("auth_rate_limits", { subject: "eq." + subject, scope: "eq." + scope }, payload);
    } else {
      await supaPost("auth_rate_limits", payload);
    }
  } catch {}
}

async function deleteDbBucket(key: string): Promise<void> {
  if (process.env.NODE_ENV === "test" || (globalThis as any).vitest) return;
  try {
    const { scope, subject } = parseKey(key);
    const { supaDelete } = await import("@/lib/supabase");
    await supaDelete("auth_rate_limits", { subject: "eq." + subject, scope: "eq." + scope });
  } catch {}
}

export async function isAuthLocked(key: string): Promise<number> {
  const mem = getMemory(key);
  const memRemaining = mem.lockedUntil - Date.now();
  if (memRemaining > 0) return memRemaining;
  const db = await getDbBucket(key);
  if (!db) return 0;
  if (db.lockedUntil > mem.lockedUntil) {
    buckets.set(key, db);
    const remaining = db.lockedUntil - Date.now();
    return remaining > 0 ? remaining : 0;
  }
  if (db.windowStartedAt > mem.windowStartedAt) buckets.set(key, db);
  const remaining = db.lockedUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

export async function recordAuthFailure(key: string): Promise<number> {
  const bucket = getMemory(key);
  bucket.count += 1;
  if (bucket.count >= MAX_FAILURES) bucket.lockedUntil = Date.now() + LOCKOUT_MS;
  await upsertDbBucket(key, bucket);
  return Math.max(0, bucket.lockedUntil - Date.now());
}

export async function clearAuthFailures(key: string): Promise<void> {
  buckets.delete(key);
  await deleteDbBucket(key);
}

export function isAuthLockedSync(key: string): number {
  const bucket = getMemory(key);
  const remaining = bucket.lockedUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

const REVIEW_WINDOW_MS = 60 * 60 * 1000;
const REVIEW_MAX = 10;

export async function consumeReviewSlot(request: Request): Promise<boolean> {
  if (process.env.NODE_ENV === "test" || (globalThis as any).vitest) {
    // In tests, use memory only to avoid DB and keep determinism
    const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
    const key = `review:ip:${ip.replace(/:/g, "_")}`;
    const now = Date.now();
    const mem = buckets.get(key);
    if (!mem || now - mem.windowStartedAt >= REVIEW_WINDOW_MS) {
      buckets.set(key, { count: 1, windowStartedAt: now, lockedUntil: 0 });
      return true;
    }
    if (mem.count >= REVIEW_MAX) return false;
    mem.count += 1;
    return true;
  }
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  const key = `review:ip:${ip.replace(/:/g, "_")}`;
  const now = Date.now();
  let bucket: Bucket;
  const mem = buckets.get(key);
  if (mem && now - mem.windowStartedAt < REVIEW_WINDOW_MS) {
    bucket = mem;
  } else {
    const db = await getDbBucket(key);
    if (db && now - db.windowStartedAt < REVIEW_WINDOW_MS) {
      bucket = db;
      buckets.set(key, bucket);
    } else {
      bucket = { count: 0, windowStartedAt: now, lockedUntil: 0 };
      buckets.set(key, bucket);
    }
  }
  if (bucket.count >= REVIEW_MAX) return false;
  bucket.count += 1;
  await upsertDbBucket(key, bucket);
  return true;
}

export function authAttemptKey(request: Request, scope: string, identity: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const safeIdentity = identity.toLowerCase().replace(/:/g, "_").trim() || "unknown";
  const safeScope = scope.replace(/:/g, "_").trim();
  const safeIp = ip.replace(/:/g, "_").trim() || "unknown";
  return `${safeScope}:${safeIdentity}:${safeIp}`;
}
