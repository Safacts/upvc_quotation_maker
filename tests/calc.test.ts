/**
 * PHASE 3 — the inline calculator's expression engine (Ctrl+/).
 *
 * Two properties matter more than the arithmetic itself:
 *
 *  1. IT CANNOT EXECUTE CODE. The obvious implementation is
 *     `new Function("return " + expr)`, which is arbitrary code execution
 *     seeded from a text field on the same origin as the session cookie. The
 *     first block below asserts the parser refuses identifiers outright — if
 *     someone ever "simplifies" calc.ts back to eval, these fail.
 *
 *  2. IT IS NEVER CONFIDENTLY WRONG. A half-typed expression must be an ERROR,
 *     not a plausible number. `1000 + 18%` producing 1000.18 instead of 1180
 *     would sail past a distracted user and land on a customer's quotation.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateExpression,
  formatCalcResult,
  roundMoney,
} from "@/lib/calc";

/** Convenience: assert success and return the number. */
function val(expr: string): number {
  const r = evaluateExpression(expr);
  expect(r.ok, `expected "${expr}" to evaluate, got: ${r.error}`).toBe(true);
  return r.value as number;
}

function err(expr: string): string {
  const r = evaluateExpression(expr);
  expect(r.ok, `expected "${expr}" to FAIL, got ${r.value}`).toBe(false);
  return r.error as string;
}

describe("calc — no code execution", () => {
  // If calc.ts ever regresses to eval/Function, every one of these starts
  // returning a value instead of an error.
  const attacks = [
    "alert(1)",
    "fetch('/x')",
    "document.cookie",
    "window",
    "globalThis",
    "this",
    "constructor",
    "[].constructor",
    "1;alert(1)",
    "(()=>1)()",
    "process.env",
    "require('fs')",
    "__proto__",
  ];

  for (const a of attacks) {
    it(`refuses ${a}`, () => {
      expect(evaluateExpression(a).ok).toBe(false);
    });
  }

  it("refuses a bare identifier even if it looks like a number word", () => {
    expect(evaluateExpression("Infinity").ok).toBe(false);
    expect(evaluateExpression("NaN").ok).toBe(false);
  });
});

describe("calc — basic arithmetic", () => {
  it("adds and subtracts left to right", () => {
    expect(val("2+2")).toBe(4);
    expect(val("10-3-2")).toBe(5);
  });

  it("respects operator precedence", () => {
    expect(val("10*5+3")).toBe(53);
    expect(val("3+10*5")).toBe(53);
    expect(val("2+3*4-6/2")).toBe(11);
  });

  it("honours brackets", () => {
    expect(val("(3+10)*5")).toBe(65);
    expect(val("[3+10]*5")).toBe(65);
    expect(val("((2))")).toBe(2);
  });

  it("handles decimals and a leading dot", () => {
    expect(val("1.5*2")).toBe(3);
    expect(val(".5*10")).toBe(5);
  });

  it("handles unary minus", () => {
    expect(val("-5+10")).toBe(5);
    expect(val("10*-2")).toBe(-20);
    expect(val("--5")).toBe(5);
  });

  it("exponentiation is right-associative", () => {
    // 2^(3^2) = 512, NOT (2^3)^2 = 64.
    expect(val("2^3^2")).toBe(512);
  });

  it("accepts x and × as multiply, ÷ as divide", () => {
    expect(val("6x7")).toBe(42);
    expect(val("6×7")).toBe(42);
    expect(val("84÷2")).toBe(42);
  });

  it("ignores whitespace", () => {
    expect(val("  12  +  8  ")).toBe(20);
  });
});

describe("calc — Indian number formatting", () => {
  it("strips grouping commas so a pasted grid value works", () => {
    // The user copies "1,23,456.78" out of the very grid they are editing.
    // A calculator that rejects its own app's number format is unusable.
    expect(val("1,23,456.78")).toBeCloseTo(123456.78, 2);
    expect(val("1,000 + 2,000")).toBe(3000);
  });
});

describe("calc — CONTEXTUAL PERCENT (the business rule)", () => {
  it("a + b% adds b PERCENT OF a", () => {
    // The GST case. A naive "% = /100" would give 1000.18 — a plausible-looking
    // number that is wrong by 180 rupees.
    expect(val("1000 + 18%")).toBe(1180);
    expect(val("2500 + 5%")).toBe(2625);
  });

  it("a - b% deducts b PERCENT OF a", () => {
    expect(val("1000 - 10%")).toBe(900);
    expect(val("2000 - 2.5%")).toBe(1950);
  });

  it("a * b% is a plain hundredth", () => {
    // "18% of 1000" written multiplicatively — the user did the work, so we do
    // not re-interpret it.
    expect(val("1000 * 18%")).toBe(180);
  });

  it("a / b% is a plain hundredth", () => {
    expect(val("180 / 18%")).toBe(1000);
  });

  it("a standalone percent is a plain hundredth", () => {
    expect(val("18%")).toBeCloseTo(0.18, 10);
  });

  it("a bracketed percent is NOT reinterpreted by an enclosing +", () => {
    // Explicit grouping is the user overriding the contextual rule.
    expect(val("1000 + (18%)")).toBeCloseTo(1000.18, 10);
  });

  it("a computed percent is NOT a bare literal", () => {
    // `2*18%` = 0.36. The user did their own arithmetic, so + adds 0.36.
    expect(val("1000 + 2*18%")).toBeCloseTo(1000.36, 10);
  });

  it("chained percents compose", () => {
    // Add 18% GST, then take 10% off the result.
    expect(val("1000 + 18% - 10%")).toBe(1062);
  });

  it("%% is a hundredth of a hundredth", () => {
    expect(val("50%%")).toBeCloseTo(0.005, 10);
  });

  it("negative percent literals still behave additively", () => {
    expect(val("1000 + -10%")).toBe(900);
  });
});

describe("calc — errors are errors, not zeros", () => {
  it("rejects an empty expression", () => {
    expect(evaluateExpression("").ok).toBe(false);
    expect(evaluateExpression("   ").ok).toBe(false);
  });

  it("rejects a half-typed expression rather than guessing", () => {
    // THE important one: showing "1200" for "1200*" while the user is still
    // typing is a confident wrong answer in a money field.
    expect(evaluateExpression("1200*").ok).toBe(false);
    expect(evaluateExpression("2++").ok).toBe(false);
    expect(evaluateExpression("+").ok).toBe(false);
  });

  it("reports division by zero explicitly", () => {
    expect(err("5/0")).toMatch(/divide by zero/i);
  });

  it("rejects unbalanced brackets", () => {
    expect(err("(1+2")).toMatch(/bracket/i);
    expect(err("1+2)")).toMatch(/bracket/i);
  });

  it("rejects unknown characters", () => {
    expect(err("2 & 3")).toMatch(/unexpected character/i);
  });

  it("rejects a stray percent with nothing before it", () => {
    expect(evaluateExpression("%50").ok).toBe(false);
  });

  it("rejects an over-long expression", () => {
    expect(err("1+".repeat(200) + "1")).toMatch(/too long/i);
  });

  it("rejects a result that overflows into Infinity", () => {
    expect(evaluateExpression("9^9^9").ok).toBe(false);
  });

  it("rejects a finite but absurd result", () => {
    expect(err("10^20")).toMatch(/too large/i);
  });

  it("never throws, whatever the input", () => {
    const nasty = ["((((", "))))", "%%%", "^^^", "1e", "..", "-", "/", "1..2"];
    for (const n of nasty) {
      expect(() => evaluateExpression(n)).not.toThrow();
    }
  });

  it("tolerates non-string input", () => {
    expect(evaluateExpression(null).ok).toBe(false);
    expect(evaluateExpression(undefined).ok).toBe(false);
    expect(evaluateExpression(42).ok).toBe(true);
  });
});

describe("calc — money formatting", () => {
  it("rounds to paise", () => {
    expect(roundMoney(1234.5678)).toBe(1234.57);
    expect(roundMoney(0.005)).toBe(0.01);
  });

  it("guards NaN", () => {
    expect(roundMoney(NaN)).toBe(0);
    expect(roundMoney(Infinity)).toBe(0);
  });

  it("drops a pointless .00 but keeps real paise", () => {
    expect(formatCalcResult(1180)).toBe("1180");
    expect(formatCalcResult(1180.5)).toBe("1180.50");
    expect(formatCalcResult(1180.456)).toBe("1180.46");
  });

  it("a GST calculation round-trips to a clean field value", () => {
    // End to end: what the user types → what lands in the rate box.
    expect(formatCalcResult(val("1000 + 18%"))).toBe("1180");
  });
});
