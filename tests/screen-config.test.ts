/**
 * PHASE 3 — Ctrl+, screen configuration (columns, order, density, page size)
 * and PgUp/PgDn record navigation.
 *
 * THE FUNCTION THAT MATTERS HERE IS `reconcileConfig`.
 *
 * A stored layout is a SNAPSHOT of the columns that existed the day the user
 * last opened the dialog. When we ship a new column, that snapshot does not
 * mention it — and the naive implementation (trust the stored order) makes the
 * new column invisible to every existing user, forever, with no error anywhere.
 * That is a support ticket nobody diagnoses correctly. These tests pin the
 * migration behaviour so a future refactor cannot quietly reintroduce it.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  applyConfigToColumns,
  defaultConfig,
  moveColumn,
  reconcileConfig,
  toggleColumn,
  type ColumnSpec,
  type ScreenConfig,
} from "@/lib/screen-config";
import { filterSignature, locate, type RecordCursor } from "@/lib/record-nav";

const COLUMNS: ColumnSpec[] = [
  { id: "quote_no", label: "Quote No" },
  { id: "customer_name", label: "Customer", required: true },
  { id: "phone", label: "Phone" },
  { id: "status", label: "Status" },
  { id: "gst", label: "GST", defaultHidden: true },
  { id: "total", label: "Total" },
];

describe("screen-config — defaults", () => {
  it("shows everything except defaultHidden columns", () => {
    const c = defaultConfig(COLUMNS);
    expect(c.order).toEqual(["quote_no", "customer_name", "phone", "status", "total"]);
    expect(c.hidden).toEqual(["gst"]);
    expect(c.density).toBe("normal");
    expect(c.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("page size options stay within the API's MAX_PAGE_SIZE of 200", () => {
    // Offering 500 when console-schemas.ts clamps to 200 would be a lie in the
    // UI — the user picks it and silently gets 200.
    for (const n of PAGE_SIZE_OPTIONS) expect(n).toBeLessThanOrEqual(200);
  });
});

describe("screen-config — reconciling a stored layout with the current code", () => {
  it("keeps the user's custom order", () => {
    const stored = {
      order: ["total", "customer_name", "quote_no"],
      hidden: ["phone", "status", "gst"],
      density: "compact" as const,
      pageSize: 100,
    };
    const c = reconcileConfig(stored, COLUMNS);
    expect(c.order).toEqual(["total", "customer_name", "quote_no"]);
    expect(c.density).toBe("compact");
    expect(c.pageSize).toBe(100);
  });

  it("APPENDS a newly shipped column instead of hiding it", () => {
    // THE regression this file exists for. The stored config predates
    // `total`; the user must still see the new column after a deploy.
    const stored = {
      order: ["quote_no", "customer_name", "phone", "status"],
      hidden: [],
      density: "normal" as const,
      pageSize: 50,
    };
    const c = reconcileConfig(stored, COLUMNS);
    expect(c.order).toContain("total");
  });

  it("does NOT resurrect a column the user explicitly hid", () => {
    const stored = {
      order: ["quote_no", "customer_name"],
      hidden: ["phone", "status", "gst", "total"],
      density: "normal" as const,
      pageSize: 50,
    };
    const c = reconcileConfig(stored, COLUMNS);
    expect(c.order).not.toContain("phone");
    expect(c.hidden).toContain("phone");
  });

  it("drops ids for columns that no longer exist", () => {
    const stored = {
      order: ["quote_no", "a_removed_column", "customer_name"],
      hidden: [],
      density: "normal" as const,
      pageSize: 50,
    };
    const c = reconcileConfig(stored, COLUMNS);
    expect(c.order).not.toContain("a_removed_column");
  });

  it("de-duplicates a corrupted order array", () => {
    // Duplicate ids would render the same column twice with duplicate React
    // keys — a console error and a visibly broken header.
    const stored = {
      order: ["quote_no", "quote_no", "customer_name"],
      hidden: [],
      density: "normal" as const,
      pageSize: 50,
    };
    const c = reconcileConfig(stored, COLUMNS);
    expect(c.order.filter((x) => x === "quote_no")).toHaveLength(1);
  });

  it("FORCES a required column back on, even if storage says otherwise", () => {
    // Defends against hand-edited localStorage as well as our own past bugs.
    const stored = {
      order: ["quote_no"],
      hidden: ["customer_name"],
      density: "normal" as const,
      pageSize: 50,
    };
    const c = reconcileConfig(stored, COLUMNS);
    expect(c.order).toContain("customer_name");
    expect(c.hidden).not.toContain("customer_name");
  });

  it("falls back to defaults rather than returning an empty grid", () => {
    const c = reconcileConfig({ order: [], hidden: [], density: "normal", pageSize: 50 }, COLUMNS);
    expect(c.order.length).toBeGreaterThan(0);
  });

  it("sanitises a bogus density and page size", () => {
    const c = reconcileConfig(
      { order: ["customer_name"], hidden: [], density: "enormous" as any, pageSize: 99999 },
      COLUMNS,
    );
    expect(c.density).toBe("normal");
    expect(c.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("returns defaults for null storage", () => {
    expect(reconcileConfig(null, COLUMNS)).toEqual(defaultConfig(COLUMNS));
  });

  it("never throws on garbage", () => {
    expect(() => reconcileConfig({ order: "nope" } as any, COLUMNS)).not.toThrow();
    expect(() => reconcileConfig({ hidden: 42 } as any, COLUMNS)).not.toThrow();
  });
});

describe("screen-config — toggling columns", () => {
  const base = defaultConfig(COLUMNS);

  it("hides a visible column", () => {
    const c = toggleColumn(base, "phone", COLUMNS);
    expect(c.order).not.toContain("phone");
    expect(c.hidden).toContain("phone");
  });

  it("restores a hidden column to its NATURAL position, not the end", () => {
    // Hiding "phone" and showing it again should put it back between
    // customer_name and status — not at the far right of the grid.
    const hidden = toggleColumn(base, "phone", COLUMNS);
    const shown = toggleColumn(hidden, "phone", COLUMNS);
    expect(shown.order).toEqual(base.order);
  });

  it("refuses to hide a required column", () => {
    const c = toggleColumn(base, "customer_name", COLUMNS);
    expect(c.order).toContain("customer_name");
    expect(c).toBe(base); // unchanged reference — a genuine no-op
  });

  it("ignores an unknown id", () => {
    expect(toggleColumn(base, "nope", COLUMNS)).toBe(base);
  });
});

describe("screen-config — reordering columns", () => {
  const base = defaultConfig(COLUMNS);

  it("moves a column left and right", () => {
    const right = moveColumn(base, "quote_no", 1);
    expect(right.order[0]).toBe("customer_name");
    expect(right.order[1]).toBe("quote_no");
    // Moving back returns the original order.
    expect(moveColumn(right, "quote_no", -1).order).toEqual(base.order);
  });

  it("will not move past either end", () => {
    expect(moveColumn(base, "quote_no", -1).order).toEqual(base.order);
    const last = base.order[base.order.length - 1];
    expect(moveColumn(base, last, 1).order).toEqual(base.order);
  });

  it("ignores a hidden or unknown column", () => {
    expect(moveColumn(base, "gst", 1)).toBe(base);
    expect(moveColumn(base, "nope", 1)).toBe(base);
  });
});

describe("screen-config — applying to TanStack columns", () => {
  const tanstack = [
    { accessorKey: "quote_no" },
    { accessorKey: "customer_name" },
    { accessorKey: "phone" },
    { accessorKey: "status" },
    { accessorKey: "gst" },
    { accessorKey: "total" },
  ];

  it("filters to visible columns and applies the saved order", () => {
    const config: ScreenConfig = {
      order: ["total", "customer_name"],
      hidden: ["quote_no", "phone", "status", "gst"],
      density: "normal",
      pageSize: 50,
    };
    const out = applyConfigToColumns(tanstack, config);
    expect(out.map((c) => c.accessorKey)).toEqual(["total", "customer_name"]);
  });

  it("matches on `id` when a column has no accessorKey", () => {
    const out = applyConfigToColumns(
      [{ id: "actions" }, { accessorKey: "customer_name" }],
      { order: ["customer_name", "actions"], hidden: [], density: "normal", pageSize: 50 },
    );
    expect(out).toHaveLength(2);
    expect((out[0] as any).accessorKey).toBe("customer_name");
  });
});

// ===========================================================================
// PgUp / PgDn record navigation
// ===========================================================================

const cursor: RecordCursor = {
  ids: ["a", "b", "c", "d"],
  page: 2,
  totalPages: 5,
  totalCount: 210,
  signature: "q=sharma",
  savedAt: Date.now(),
};

describe("record-nav — locating a record in the rail", () => {
  it("finds the neighbours of a middle record", () => {
    const n = locate(cursor, "b", 50);
    expect(n.index).toBe(1);
    expect(n.prevId).toBe("a");
    expect(n.nextId).toBe("c");
  });

  it("has no prev at the start of the page and no next at the end", () => {
    expect(locate(cursor, "a", 50).prevId).toBeNull();
    expect(locate(cursor, "d", 50).nextId).toBeNull();
  });

  it("reports position across the WHOLE result set, not within the page", () => {
    // Page 2 at 50 per page: the first row is record 51, so "b" is 52 of 210.
    const n = locate(cursor, "b", 50);
    expect(n.position).toBe(52);
    expect(n.total).toBe(210);
  });

  it("flags the page boundaries so the UI can explain a disabled arrow", () => {
    expect(locate(cursor, "a", 50).atPageStart).toBe(true);
    expect(locate(cursor, "d", 50).atPageEnd).toBe(true);
    expect(locate(cursor, "b", 50).atPageStart).toBe(false);
  });

  it("returns NO neighbours for a record that is not in the rail", () => {
    // A deep link, or a row filtered out after an edit changed its status.
    // Guessing a neighbour here would jump the user to an unrelated quotation.
    const n = locate(cursor, "zzz", 50);
    expect(n.index).toBe(-1);
    expect(n.prevId).toBeNull();
    expect(n.nextId).toBeNull();
  });

  it("handles a missing cursor and a blank id", () => {
    expect(locate(null, "a", 50).index).toBe(-1);
    expect(locate(cursor, "", 50).index).toBe(-1);
  });

  it("a single-record rail has no neighbours in either direction", () => {
    const one: RecordCursor = { ...cursor, ids: ["only"], page: 1, totalPages: 1, totalCount: 1 };
    const n = locate(one, "only", 50);
    expect(n.prevId).toBeNull();
    expect(n.nextId).toBeNull();
    expect(n.position).toBe(1);
  });
});

describe("record-nav — filter signatures", () => {
  it("is stable regardless of key order", () => {
    // Without sorting, re-ordering an object literal in the source would
    // invalidate every user's cursor on the next deploy.
    expect(filterSignature({ q: "a", status: "won" })).toBe(
      filterSignature({ status: "won", q: "a" }),
    );
  });

  it("ignores empty and nullish values", () => {
    expect(filterSignature({ q: "a", status: "", from: null, to: undefined })).toBe("q=a");
  });

  it("differs when a filter actually differs", () => {
    expect(filterSignature({ q: "a" })).not.toBe(filterSignature({ q: "b" }));
  });
});
