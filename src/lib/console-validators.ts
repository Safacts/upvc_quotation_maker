/**
 * console-validators.ts — Standardized client-side field validators for the Console.
 *
 * Provides real-time and submission validation for critical contact fields (phone, email, GST)
 * across QuotationEditor, QuickCreate, Customers, Leads, Team, and Challans screens.
 */

/**
 * Validates an email address.
 * Returns an error message string if invalid, or null if valid (or empty if not required).
 */
export function validateEmail(email: string, required = false): string | null {
  const trimmed = (email ?? "").trim();
  if (!trimmed) {
    return required ? "Email address is required" : null;
  }

  // Maximum standard length per RFC 5321
  if (trimmed.length > 254) {
    return "Email address is too long (max 254 characters)";
  }

  // Check for multiple emails separated by commas or semicolons
  if (/[,;]/.test(trimmed)) {
    return "Enter a single email address only";
  }

  // Standard email regex (ensures username, @, valid domain, and 2+ char TLD)
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) {
    return "Please enter a valid email address (e.g. name@domain.com)";
  }

  return null;
}

/**
 * Validates a mobile/phone number.
 * Ensures the input does not exceed single mobile limits (10 digits, or prefixed with +91 / 0)
 * and strictly rejects multiple numbers or non-mobile formats.
 */
export function validatePhone(phone: string, required = false): string | null {
  const trimmed = (phone ?? "").trim();
  if (!trimmed) {
    return required ? "Phone number is required" : null;
  }

  // Check if multiple phone numbers were provided via common separators
  if (/[,;/]|\band\b/i.test(phone)) {
    return "Enter a single phone number only (remove commas/slashes)";
  }

  // Strip allowed formatting characters: spaces, hyphens, parentheses, plus
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (digitsOnly.length === 0) {
    return "Phone number must contain digits";
  }

  // If Indian mobile with country code or trunk 0:
  let standard10 = digitsOnly;
  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    standard10 = digitsOnly.slice(2);
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
    standard10 = digitsOnly.slice(1);
  }

  if (standard10.length < 10) {
    return `Phone number must have 10 digits (entered ${standard10.length})`;
  }

  if (standard10.length > 10) {
    return `Phone number must be exactly 10 digits (entered ${digitsOnly.length} digits)`;
  }

  if (!/^[6-9]\d{9}$/.test(standard10)) {
    return "Indian mobile numbers must start with 6, 7, 8, or 9";
  }

  return null;
}

/**
 * Cleans phone input as the user types:
 * Allows only digits, optional leading '+', spaces, and hyphens.
 * Strictly caps digits:
 * - If leading '+' or starting with '91': max 12 digits (+91 followed by 10 digits).
 * - If leading '0': max 11 digits (0 followed by 10 digits).
 * - Regular: max 10 digits.
 * Any extra digits typed or pasted beyond this are immediately discarded.
 */
export function sanitizePhoneInput(value: string): string {
  if (!value) return "";

  // Keep only digits, leading '+', spaces, hyphens, and parentheses
  let cleaned = value.replace(/[^\d+\-\s()]/g, "");

  // Only allow a single '+' if it is at the very beginning
  const startsWithPlus = cleaned.trimStart().startsWith("+");
  cleaned = cleaned.replace(/\+/g, "");
  if (startsWithPlus) {
    cleaned = "+" + cleaned;
  }

  // Determine maximum allowable digits
  const digitsOnly = cleaned.replace(/\D/g, "");
  let maxDigits = 10;
  if (startsWithPlus || digitsOnly.startsWith("91")) {
    maxDigits = 12; // 2 country code digits + 10 mobile digits
  } else if (digitsOnly.startsWith("0")) {
    maxDigits = 11; // 1 trunk zero + 10 mobile digits
  }

  if (digitsOnly.length > maxDigits) {
    let digitCount = 0;
    let truncated = "";
    for (const char of cleaned) {
      if (/\d/.test(char)) {
        if (digitCount < maxDigits) {
          truncated += char;
          digitCount++;
        }
      } else {
        truncated += char;
      }
    }
    cleaned = truncated;
  }

  return cleaned.trimEnd().slice(0, 16);
}

/**
 * Validates GSTIN (Goods and Services Tax Identification Number - 15 characters).
 */
export function validateGSTIN(gstin: string): string | null {
  const trimmed = (gstin ?? "").trim().toUpperCase();
  if (!trimmed) return null;

  if (trimmed.length !== 15) {
    return `GSTIN must be exactly 15 characters (entered ${trimmed.length})`;
  }

  // Standard Indian GSTIN regex: 2 state digits + 10 PAN chars + 1 entity digit + 1 'Z' + 1 checksum
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstinRegex.test(trimmed)) {
    return "Invalid GSTIN format (e.g. 29ABCDE1234F1Z5)";
  }

  return null;
}
