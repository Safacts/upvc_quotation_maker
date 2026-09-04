import { describe, it, expect } from "vitest";
import {
  validateEmail,
  validatePhone,
  sanitizePhoneInput,
  validateGSTIN,
  sanitizeNumericInput,
} from "../src/lib/console-validators";

describe("console-validators — validatePhone", () => {
  it("accepts valid 10-digit Indian mobile numbers", () => {
    expect(validatePhone("9876543210")).toBeNull();
    expect(validatePhone("8123456789")).toBeNull();
    expect(validatePhone("7000000001")).toBeNull();
    expect(validatePhone("6399999999")).toBeNull();
  });

  it("accepts valid Indian numbers with +91 country code or trunk 0", () => {
    expect(validatePhone("+91 98765 43210")).toBeNull();
    expect(validatePhone("+919876543210")).toBeNull();
    expect(validatePhone("919876543210")).toBeNull();
    expect(validatePhone("09876543210")).toBeNull();
    expect(validatePhone("0-98765-43210")).toBeNull();
  });

  it("allows empty when required=false and rejects when required=true", () => {
    expect(validatePhone("")).toBeNull();
    expect(validatePhone("   ")).toBeNull();
    expect(validatePhone("", true)).toBe("Phone number is required");
    expect(validatePhone("   ", true)).toBe("Phone number is required");
  });

  it("rejects numbers with fewer than 10 digits", () => {
    expect(validatePhone("98765")).toBe("Phone number must have 10 digits (entered 5)");
    expect(validatePhone("987654321")).toBe("Phone number must have 10 digits (entered 9)");
  });

  it("strictly rejects numbers with more than 10 digits (e.g. 11, 12, 13, 14, 15, 16)", () => {
    expect(validatePhone("98765432101")).toContain("must be exactly 10 digits");
    expect(validatePhone("987654321012")).toContain("must be exactly 10 digits");
    expect(validatePhone("987654321012345")).toContain("must be exactly 10 digits");
  });

  it("rejects multiple phone numbers joined by delimiters", () => {
    expect(validatePhone("9876543210, 9123456780")).toBe(
      "Enter a single phone number only (remove commas/slashes)",
    );
    expect(validatePhone("9876543210 / 9123456780")).toBe(
      "Enter a single phone number only (remove commas/slashes)",
    );
    expect(validatePhone("9876543210; 9123456780")).toBe(
      "Enter a single phone number only (remove commas/slashes)",
    );
  });

  it("rejects mobile numbers starting with digits other than 6, 7, 8, or 9", () => {
    expect(validatePhone("1234567890")).toBe("Indian mobile numbers must start with 6, 7, 8, or 9");
    expect(validatePhone("5555555555")).toBe("Indian mobile numbers must start with 6, 7, 8, or 9");
    expect(validatePhone("2345678901")).toBe("Indian mobile numbers must start with 6, 7, 8, or 9");
  });
});

describe("console-validators — sanitizePhoneInput", () => {
  it("allows standard 10-digit mobile number typing", () => {
    expect(sanitizePhoneInput("9876543210")).toBe("9876543210");
  });

  it("blocks typing or pasting beyond 10 digits for raw numbers", () => {
    // Attempting to type 11, 12, 16 digits
    expect(sanitizePhoneInput("98765432101")).toBe("9876543210");
    expect(sanitizePhoneInput("9876543210123456")).toBe("9876543210");
  });

  it("blocks multi-number pasting into single field", () => {
    expect(sanitizePhoneInput("9876543210, 9876543211")).toBe("9876543210");
    expect(sanitizePhoneInput("9876543210 / 9988776655")).toBe("9876543210");
  });

  it("allows +91 prefix and caps at 12 digits (2 prefix + 10 mobile)", () => {
    expect(sanitizePhoneInput("+91 98765 43210")).toBe("+91 98765 43210");
    // Extra digit beyond 12 total digits is blocked
    expect(sanitizePhoneInput("+91 98765 432109")).toBe("+91 98765 43210");
  });

  it("allows leading 0 prefix and caps at 11 digits (1 prefix + 10 mobile)", () => {
    expect(sanitizePhoneInput("09876543210")).toBe("09876543210");
    expect(sanitizePhoneInput("098765432109")).toBe("09876543210");
  });

  it("strips invalid non-phone characters", () => {
    expect(sanitizePhoneInput("abc9876xyz543210#$")).toBe("9876543210");
  });
});

describe("console-validators — validateEmail", () => {
  it("accepts valid email addresses", () => {
    expect(validateEmail("user@example.com")).toBeNull();
    expect(validateEmail("first.last@company.co.in")).toBeNull();
    expect(validateEmail("team+dev@startup.io")).toBeNull();
    expect(validateEmail("a@b.com")).toBeNull();
  });

  it("allows empty when required=false and rejects when required=true", () => {
    expect(validateEmail("")).toBeNull();
    expect(validateEmail("   ")).toBeNull();
    expect(validateEmail("", true)).toBe("Email address is required");
    expect(validateEmail("   ", true)).toBe("Email address is required");
  });

  it("rejects malformed email addresses", () => {
    expect(validateEmail("notanemail")).toBe(
      "Please enter a valid email address (e.g. name@domain.com)",
    );
    expect(validateEmail("user@")).toBe(
      "Please enter a valid email address (e.g. name@domain.com)",
    );
    expect(validateEmail("@example.com")).toBe(
      "Please enter a valid email address (e.g. name@domain.com)",
    );
    expect(validateEmail("user@domain")).toBe(
      "Please enter a valid email address (e.g. name@domain.com)",
    );
    expect(validateEmail("user@domain.")).toBe(
      "Please enter a valid email address (e.g. name@domain.com)",
    );
    expect(validateEmail("user with spaces@domain.com")).toBe(
      "Please enter a valid email address (e.g. name@domain.com)",
    );
  });

  it("rejects multiple emails separated by comma or semicolon", () => {
    expect(validateEmail("a@b.com, c@d.com")).toBe("Enter a single email address only");
    expect(validateEmail("a@b.com; c@d.com")).toBe("Enter a single email address only");
  });
});

describe("console-validators — validateGSTIN", () => {
  it("accepts valid Indian GST numbers", () => {
    expect(validateGSTIN("29ABCDE1234F1Z5")).toBeNull();
    expect(validateGSTIN("27AAPFU0939F1ZV")).toBeNull();
  });

  it("allows empty GSTIN", () => {
    expect(validateGSTIN("")).toBeNull();
    expect(validateGSTIN("  ")).toBeNull();
  });

  it("rejects GSTIN with invalid length", () => {
    expect(validateGSTIN("29ABCDE1234F1Z")).toContain("must be exactly 15 characters");
    expect(validateGSTIN("29ABCDE1234F1Z5X")).toContain("must be exactly 15 characters");
  });

  it("rejects invalid format", () => {
    expect(validateGSTIN("INVALIDGSTIN123")).toContain("Invalid GSTIN format");
  });
});

describe("console-validators — sanitizeNumericInput", () => {
  it("strips alphabets and special characters", () => {
    expect(sanitizeNumericInput("123abc456")).toBe("123456");
    expect(sanitizeNumericInput("Rs. 1,500.50")).toBe("1500.50");
    expect(sanitizeNumericInput("text-only")).toBe("");
  });

  it("handles decimal numbers properly when allowDecimal=true", () => {
    expect(sanitizeNumericInput("123.45")).toBe("123.45");
    expect(sanitizeNumericInput("123.45.67")).toBe("123.4567");
    expect(sanitizeNumericInput(".50")).toBe(".50");
  });

  it("strips decimal points when allowDecimal=false", () => {
    expect(sanitizeNumericInput("123.45", false)).toBe("12345");
    expect(sanitizeNumericInput("100 nos", false)).toBe("100");
  });

  it("strips exponential notation e and signs", () => {
    expect(sanitizeNumericInput("1e5")).toBe("15");
    expect(sanitizeNumericInput("-500")).toBe("500");
    expect(sanitizeNumericInput("+123.45")).toBe("123.45");
  });
});
