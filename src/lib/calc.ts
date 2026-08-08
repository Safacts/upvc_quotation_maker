/**
 * calc.ts — the expression engine behind the console's inline calculator (Ctrl+/).
 *
 * ============================================================================
 *  WHY THIS IS HAND-WRITTEN AND NOT `eval` / `new Function`
 * ============================================================================
 * The obvious two-line implementation is `new Function("return " + expr)()`.
 * It is also arbitrary code execution seeded from a text field. Even though the
 * input here is typed by the tenant into their own browser, an expression can
 * arrive from a pasted string, and the console runs on the SAME ORIGIN as the
 * session cookie. A parser that can only ever produce a number cannot be
 * turned into anything else, so the whole class of problem is removed rather
 * than mitigated. It is ~150 lines and it is worth it.
 *
 * It also lets us give REAL errors ("Unbalanced bracket") instead of a
 * `SyntaxError` string, and lets us define `%` the way a business calculator
 * defines it (below) rather than the way JavaScript's modulo does — `18%` in a
 * rate field must mean "18 percent", never "remainder after dividing by 18".
 *
 * ============================================================================
 *  PERCENT SEMANTICS — the deliberate part
 * ============================================================================
 * A fabricator using this calculator is almost always doing one of three things:
 * adding GST, taking a discount, or working out a margin. So `%` is CONTEXTUAL,
 * exactly like a desk calculator and like Windows Calculator:
 *
 *     1000 + 18%     -> 1180      (18% OF 1000, added)
 *     1000 - 10%     -> 900       (10% OF 1000, deducted)
 *     1000 * 18%     -> 180       (a plain hundredth: 0.18 * 1000)
 *     18%            -> 0.18      (standalone, a plain hundredth)
 *
 * The additive form is the one that matters. Defining `%` as a bare "divide by
 * 100" everywhere would make `1000 + 18%` evaluate to 1000.18 — a number that
 * looks plausible, sails past a distracted user, and lands on a customer's
 * quotation. A wrong answer that looks right is the worst failure this product
 * can have, so the ambiguous case is resolved the way the user means it.
 *
 * ============================================================================
 *  GRAMMAR
 * ============================================================================
 *   expr    := term (('+' | '-') term)*
 *   term    := factor (('*' | '/' | 'x' | '÷') factor)*
 *   factor  := unary ('^' factor)?          // right-associative
 *   unary   := ('-' | '+')* postfix
 *   postfix := primary '%'*
 *   primary := number | '(' expr ')'
 */

/**
 * NOTE ON SHAPE: flat optional fields, NOT a discriminated union.
 *
 * `tsconfig.json` sets `strict: false`, which disables the control-flow
 * narrowing a `{ok:true}|{ok:false}` union depends on — `if (r.ok) r.value`
 * then fails to compile with "Property 'value' does not exist on CalcErr".
 * This is the same shape, for the same reason, as `ConsoleSession` in
 * console-auth.ts and `TenantResolution` in tenant.ts. Do not "tidy" it into a
 * union without turning `strict` on first.
 */
export interface CalcResult {
  ok: boolean;
  /** Set only when ok === true. */
  value?: number;
  /** Set only when ok === false. */
  error?: string;
}

/** Hard cap on input length. A pasted novel should be rejected, not parsed. */
const MAX_EXPRESSION_LENGTH = 200;

/**
 * Anything past this is not a uPVC quotation figure, it is a runaway `^`.
 * `2^2^2^2^2` reaches 1e19728 in three steps and then poisons every downstream
 * sum with `Infinity`; refusing is more useful than propagating it.
 */
const MAX_ABS_VALUE = 1e15;

type Tok =
  | { t: "num"; v: number }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "^" }
  | { t: "pct" }
  | { t: "lp" }
  | { t: "rp" };

/**
 * Turn the raw string into tokens.
 *
 * Commas are STRIPPED, not rejected. Indian grouping means a user will paste
 * "1,23,456.78" straight out of the grid they are looking at, and a calculator
 * that refuses its own application's number format is a calculator nobody uses.
 * There are no function calls in this grammar, so a comma can never be a
 * separator and dropping it is unambiguous.
 */
function tokenize(input: string): Tok[] | string {
  const s = input.replace(/,/g, "").replace(/\s+/g, "");
  const out: Tok[] = [];
  let i = 0;

  while (i < s.length) {
    const c = s[i];

    if (c >= "0" && c <= "9") {
      let j = i;
      let seenDot = false;
      while (j < s.length) {
        const d = s[j];
        if (d >= "0" && d <= "9") {
          j += 1;
        } else if (d === "." && !seenDot) {
          seenDot = true;
          j += 1;
        } else {
          break;
        }
      }
      const n = Number(s.slice(i, j));
      if (!Number.isFinite(n)) return `Not a number: "${s.slice(i, j)}"`;
      out.push({ t: "num", v: n });
      i = j;
      continue;
    }

    // ".5" is a number a user will type when entering a rate.
    if (c === ".") {
      let j = i + 1;
      while (j < s.length && s[j] >= "0" && s[j] <= "9") j += 1;
      if (j === i + 1) return "Stray decimal point";
      const n = Number(s.slice(i, j));
      if (!Number.isFinite(n)) return "Invalid decimal";
      out.push({ t: "num", v: n });
      i = j;
      continue;
    }

    switch (c) {
      case "+":
      case "-":
      case "*":
      case "/":
      case "^":
        out.push({ t: "op", v: c });
        i += 1;
        break;
      // `x` and `×` because that is what a person writes for "times", and `÷`
      // because it is on every phone keypad they have ever used.
      case "x":
      case "X":
      case "×":
        out.push({ t: "op", v: "*" });
        i += 1;
        break;
      case "÷":
        out.push({ t: "op", v: "/" });
        i += 1;
        break;
      case "%":
        out.push({ t: "pct" });
        i += 1;
        break;
      case "(":
      case "[":
        out.push({ t: "lp" });
        i += 1;
        break;
      case ")":
      case "]":
        out.push({ t: "rp" });
        i += 1;
        break;
      default:
        return `Unexpected character "${c}"`;
    }
  }

  return out;
}

/**
 * A parsed sub-expression.
 *
 * `percentLiteral` is the whole reason this carries more than a number. It is
 * set ONLY when the operand was written as a bare `N%` at the top level of a
 * term — that is precisely the case where `a + b%` must mean "b percent OF a".
 * `1000 + 2*18%` is NOT a percent literal (the user did their own arithmetic),
 * so it adds 0.36 and not 180.
 */
interface Operand {
  value: number;
  /** The raw number before `/100`, when this operand is a bare `N%`. */
  percentLiteral: number | null;
}

class Parser {
  private pos = 0;

  constructor(private readonly toks: Tok[]) {}

  private peek(): Tok | undefined {
    return this.toks[this.pos];
  }

  private next(): Tok | undefined {
    return this.toks[this.pos++];
  }

  atEnd(): boolean {
    return this.pos >= this.toks.length;
  }

  /** The token that stopped the parse, for a specific error message. */
  peekToken(): Tok | undefined {
    return this.peek();
  }

  parseExpr(): Operand {
    let left = this.parseTerm();

    for (;;) {
      const tok = this.peek();
      if (!tok || tok.t !== "op" || (tok.v !== "+" && tok.v !== "-")) break;
      this.next();
      const right = this.parseTerm();

      // THE contextual-percent rule. See the header.
      const rhs =
        right.percentLiteral !== null
          ? (left.value * right.percentLiteral) / 100
          : right.value;

      left = {
        value: tok.v === "+" ? left.value + rhs : left.value - rhs,
        percentLiteral: null,
      };
    }

    return left;
  }

  private parseTerm(): Operand {
    let left = this.parseFactor();
    let single = true;

    for (;;) {
      const tok = this.peek();
      if (!tok || tok.t !== "op" || (tok.v !== "*" && tok.v !== "/")) break;
      this.next();
      single = false;
      const right = this.parseFactor();

      if (tok.v === "/") {
        if (right.value === 0) throw new Error("Cannot divide by zero");
        left = { value: left.value / right.value, percentLiteral: null };
      } else {
        left = { value: left.value * right.value, percentLiteral: null };
      }
    }

    // Only an unmultiplied, undivided operand keeps its percent identity.
    return single ? left : { value: left.value, percentLiteral: null };
  }

  private parseFactor(): Operand {
    const base = this.parseUnary();
    const tok = this.peek();
    if (tok && tok.t === "op" && tok.v === "^") {
      this.next();
      // Right-associative: 2^3^2 is 2^(3^2) = 512, not (2^3)^2 = 64.
      const exp = this.parseFactor();
      const value = Math.pow(base.value, exp.value);
      if (!Number.isFinite(value)) throw new Error("Result is not a finite number");
      return { value, percentLiteral: null };
    }
    return base;
  }

  private parseUnary(): Operand {
    const tok = this.peek();
    if (tok && tok.t === "op" && (tok.v === "-" || tok.v === "+")) {
      this.next();
      const inner = this.parseUnary();
      if (tok.v === "-") {
        return {
          value: -inner.value,
          // `-10%` must stay a percent literal so `1000 - -10%` behaves.
          percentLiteral: inner.percentLiteral === null ? null : -inner.percentLiteral,
        };
      }
      return inner;
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Operand {
    let operand = this.parsePrimary();
    while (this.peek()?.t === "pct") {
      this.next();
      operand = {
        value: operand.value / 100,
        // `50%%` is a hundredth of a hundredth, and is no longer a bare
        // literal that an enclosing `+` should reinterpret.
        percentLiteral: operand.percentLiteral === null ? operand.value : null,
      };
    }
    return operand;
  }

  private parsePrimary(): Operand {
    const tok = this.next();
    if (!tok) throw new Error("Expression ends unexpectedly");

    if (tok.t === "num") return { value: tok.v, percentLiteral: null };

    if (tok.t === "lp") {
      const inner = this.parseExpr();
      const close = this.next();
      if (!close || close.t !== "rp") throw new Error("Unbalanced bracket");
      // Bracketing is an explicit grouping, so `1000 + (18%)` is 1000.18 and
      // not 1180 — the user asked for the value on its own.
      return { value: inner.value, percentLiteral: null };
    }

    if (tok.t === "rp") throw new Error("Unbalanced bracket");
    if (tok.t === "pct") throw new Error("Nothing before %");
    throw new Error("Unexpected operator");
  }
}

/**
 * Evaluate an arithmetic expression typed into the inline calculator.
 *
 * Never throws — every failure path returns `{ ok: false, error }` so a caller
 * rendering live results per keystroke does not have to wrap each one.
 * A HALF-TYPED EXPRESSION IS AN ERROR, NOT A ZERO: returning 0 for "1200*"
 * would show a confident wrong answer in the preview while the user is still
 * typing, which is the failure mode this whole module exists to avoid.
 */
export function evaluateExpression(input: unknown): CalcResult {
  const raw = (input ?? "").toString();
  if (!raw.trim()) return { ok: false, error: "Empty expression" };
  if (raw.length > MAX_EXPRESSION_LENGTH) {
    return { ok: false, error: `Expression is too long (max ${MAX_EXPRESSION_LENGTH})` };
  }

  const toks = tokenize(raw);
  if (typeof toks === "string") return { ok: false, error: toks };
  if (toks.length === 0) return { ok: false, error: "Empty expression" };

  try {
    const parser = new Parser(toks);
    const result = parser.parseExpr();
    if (!parser.atEnd()) {
      // Name the actual problem. A trailing `)` is nearly always a missing
      // opening bracket, and "Unbalanced bracket" tells the user where to look;
      // "Unexpected trailing input" makes them hunt.
      return {
        ok: false,
        error: parser.peekToken()?.t === "rp" ? "Unbalanced bracket" : "Unexpected trailing input",
      };
    }
    if (!Number.isFinite(result.value)) return { ok: false, error: "Result is not a finite number" };
    if (Math.abs(result.value) > MAX_ABS_VALUE) return { ok: false, error: "Result is too large" };
    return { ok: true, value: result.value };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

/**
 * Round for writing back into a money field.
 *
 * `Math.round(x*100)/100` and not `toFixed`: `toFixed` returns a string and
 * rounds half-away-from-zero on a decimal representation the float never
 * actually held. Two decimals because every rupee field in this product is
 * stored to paise — see the money notes in src/lib/pricing.ts.
 */
export function roundMoney(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/**
 * Format a calculator result for display in the field.
 *
 * Trailing zeros are dropped: writing "1180" back into a rate box is what the
 * user expects, and "1180.00" would immediately be re-formatted anyway. Values
 * with real paise keep both decimals.
 */
export function formatCalcResult(n: number): string {
  const r = roundMoney(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

/**
 * True when a DOM element is a field the calculator may write into.
 *
 * Deliberately BROAD — any numeric input in the console qualifies, so the
 * shortcut does not become a memory test about which four boxes support it.
 * A field opts OUT with `data-calc="off"` (used for the GST percentage box,
 * where a `+18%` expression would mean something different from what it says).
 */
export function isCalculableField(el: Element | null | undefined): el is HTMLInputElement {
  if (!el) return false;
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.disabled || el.readOnly) return false;
  if (el.getAttribute("data-calc") === "off") return false;
  if (el.getAttribute("data-calc") === "on") return true;

  const mode = (el.getAttribute("inputmode") || "").toLowerCase();
  if (mode === "decimal" || mode === "numeric") return true;
  if (el.type === "number") return true;
  return el.classList.contains("vc-num");
}

/**
 * Write a value into a CONTROLLED React input so that React sees the change.
 *
 * Setting `el.value` directly updates the DOM and React never hears about it:
 * the component re-renders from unchanged state and the value snaps back on the
 * next keystroke — the classic "my edit disappeared" bug. React tracks the last
 * value it wrote on the node and skips the synthetic event when it appears
 * unchanged, so the native prototype setter has to be used to bypass that
 * tracker before dispatching a bubbling `input` event, which React's root
 * listener turns into the component's `onChange`.
 *
 * This is what lets the calculator work on EVERY numeric field in the console
 * without each one having to register itself.
 */
export function setNativeInputValue(el: HTMLInputElement, value: string): void {
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc?.set) {
    desc.set.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
