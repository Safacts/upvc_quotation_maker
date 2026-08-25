import { createHash } from "crypto";
import * as bcrypt from "bcryptjs";

export function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  // Use bcrypt with cost factor 12
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Check if hash is bcrypt (starts with $2a$, $2b$, or $2y$)
  if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
    return bcrypt.compare(password, hash);
  }
  // Fallback to SHA-256 for legacy hashes
  const sha256Hash = createHash("sha256").update(password, "utf8").digest("hex");
  return sha256Hash === hash;
}

export async function maybeUpgradeHash(password: string, hash: string): Promise<string | null> {
  // If it's a legacy SHA-256 hash and password verifies, return new bcrypt hash
  if (!(hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$"))) {
    const sha256Hash = createHash("sha256").update(password, "utf8").digest("hex");
    if (sha256Hash === hash) {
      return hashPassword(password);
    }
  }
  return null;
}