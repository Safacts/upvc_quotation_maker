import { createHash, randomBytes } from "crypto";

/** Public quotation links use an opaque 128-bit bearer token. */
export const QUOTATION_TOKEN_EXPIRY_DAYS = 30;

export function createQuotationToken(): string {
  return randomBytes(16).toString("hex");
}

export function hashQuotationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function quotationTokenExpiry(now = new Date()): string {
  return new Date(
    now.getTime() + QUOTATION_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}
