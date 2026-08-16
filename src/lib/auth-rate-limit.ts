type Bucket = { count: number; windowStartedAt: number; lockedUntil: number };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 30 * 60 * 1000;
const MAX_FAILURES = 5;

function get(key: string): Bucket {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now - current.windowStartedAt >= WINDOW_MS) {
    const fresh = { count: 0, windowStartedAt: now, lockedUntil: 0 };
    buckets.set(key, fresh);
    return fresh;
  }
  return current;
}

export function isAuthLocked(key: string): number {
  const bucket = get(key);
  const remaining = bucket.lockedUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

export function recordAuthFailure(key: string): number {
  const bucket = get(key);
  bucket.count += 1;
  if (bucket.count >= MAX_FAILURES) bucket.lockedUntil = Date.now() + LOCKOUT_MS;
  return Math.max(0, bucket.lockedUntil - Date.now());
}

export function clearAuthFailures(key: string): void {
  buckets.delete(key);
}

export function authAttemptKey(request: Request, scope: string, identity: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  return `${scope}:${identity.toLowerCase()}:${ip}`;
}
