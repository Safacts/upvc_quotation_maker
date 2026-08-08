/**
 * screen-config.ts — per-screen column visibility, order and density (Ctrl+,).
 *
 * ============================================================================
 *  WHY Ctrl+, AND NOT F12
 * ============================================================================
 * F12 is Tally's "Configure" key and it is the one users ask for by name. It is
 * also DevTools in Chrome, intercepted before the page sees a keydown, so
 * binding it would be a promise we cannot keep. Ctrl+, is the settings
 * convention in VS Code and most desktop software, and it is deliverable. The
 * cheatsheet states the substitution explicitly — told once, users adapt.
 *
 * ============================================================================
 *  WHY PER-SCREEN AND NOT GLOBAL
 * ============================================================================
 * `useUI` already owns GLOBAL display preferences (font size, element size) for
 * the whole console. This is a different axis: which COLUMNS this particular
 * grid shows, in what order, and how tightly. A fabricator wants a dense
 * quotations list with rate columns and an airy customer list without GSTIN.
 * Folding both into one store would mean either a global column list (nonsense)
 * or a per-screen font size (annoying).
 *
 * Persistence is `localStorage`, keyed by `vc:screen:<clientId>:<screenId>`, so
 * two tenants sharing a browser — which is exactly what our demo accounts are —
 * never see each other's layout.
 *
 * ============================================================================
 *  THE MIGRATION RULE (the part that will actually bite)
 * ============================================================================
 * Stored config is a SNAPSHOT of the columns that existed the day the user
 * touched this dialog. When we later add a column, that snapshot does not
 * mention it. `reconcileConfig` therefore treats the CODE's column list as the
 * source of truth: unknown ids stored from a removed column are dropped, and
 * columns the user has never seen are APPENDED AS VISIBLE (unless flagged
 * `defaultHidden`). A new feature that silently fails to appear for every
 * existing user — because their saved layout predates it — is a support ticket
 * nobody will diagnose correctly.
 *
 * `required: true` columns can never be hidden. A quotations grid with no
 * customer column is not a customisation, it is a broken screen.
 */

export type Density = "compact" | "normal" | "relaxed";

export interface ColumnSpec {
  /** Must match the TanStack column id / accessorKey exactly. */
  id: string;
  label: string;
  /** Cannot be hidden — the checkbox renders disabled. */
  required?: boolean;
  /** Hidden on first run, but discoverable in the dialog. */
  defaultHidden?: boolean;
}

export interface ScreenConfig {
  /** Visible column ids, IN DISPLAY ORDER. */
  order: string[];
  /** Explicitly hidden ids. Kept so reordering does not resurrect them. */
  hidden: string[];
  density: Density;
  /** Rows per page. Bounded by PAGE_SIZE_OPTIONS. */
  pageSize: number;
}

export const DENSITIES: Array<{ value: Density; label: string; hint: string }> = [
  { value: "compact", label: "Compact", hint: "Most rows on screen" },
  { value: "normal", label: "Normal", hint: "Default" },
  { value: "relaxed", label: "Relaxed", hint: "Easier to read" },
];

/**
 * 200 is the ceiling because `MAX_PAGE_SIZE` in console-schemas.ts is 200 — the
 * API clamps anything larger, and an option that silently does not do what it
 * says is worse than not offering it.
 */
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

export const DEFAULT_DENSITY: Density = "normal";
export const DEFAULT_PAGE_SIZE = 50;

const STORAGE_PREFIX = "vc:screen:";

function storageKey(clientId: string, screenId: string): string {
  return `${STORAGE_PREFIX}${clientId}:${screenId}`;
}

/** The config a screen starts with, derived purely from its column specs. */
export function defaultConfig(columns: ColumnSpec[]): ScreenConfig {
  return {
    order: columns.filter((c) => !c.defaultHidden).map((c) => c.id),
    hidden: columns.filter((c) => c.defaultHidden).map((c) => c.id),
    density: DEFAULT_DENSITY,
    pageSize: DEFAULT_PAGE_SIZE,
  };
}

function clampPageSize(n: unknown): number {
  const v = Number(n);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(v) ? v : DEFAULT_PAGE_SIZE;
}

function isDensity(v: unknown): v is Density {
  return v === "compact" || v === "normal" || v === "relaxed";
}

/**
 * Reconcile a stored config against the CURRENT column list.
 *
 * This is the function that makes stored layouts survive a deploy. See the
 * migration rule in the header — it is pure and exhaustively tested because
 * getting it wrong makes new columns invisible to existing users forever.
 */
export function reconcileConfig(
  stored: Partial<ScreenConfig> | null | undefined,
  columns: ColumnSpec[],
): ScreenConfig {
  const known = new Map(columns.map((c) => [c.id, c]));
  const base = defaultConfig(columns);
  if (!stored) return base;

  const storedOrder = Array.isArray(stored.order) ? stored.order : [];
  const storedHidden = new Set(Array.isArray(stored.hidden) ? stored.hidden : []);

  // 1. Keep the user's order, dropping ids for columns that no longer exist.
  //    A `Set` also de-duplicates a corrupted entry rather than rendering the
  //    same column twice with duplicate React keys.
  const seen = new Set<string>();
  const order: string[] = [];
  for (const id of storedOrder) {
    if (!known.has(id) || seen.has(id) || storedHidden.has(id)) continue;
    seen.add(id);
    order.push(id);
  }

  // 2. Append columns the stored config has never heard of. A column the user
  //    explicitly hid is in `storedHidden` and is NOT resurrected here.
  for (const col of columns) {
    if (seen.has(col.id) || storedHidden.has(col.id)) continue;
    if (col.defaultHidden) continue;
    seen.add(col.id);
    order.push(col.id);
  }

  // 3. A required column is never hidden, whatever the stored data claims —
  //    including data hand-edited in devtools.
  for (const col of columns) {
    if (!col.required) continue;
    storedHidden.delete(col.id);
    if (!seen.has(col.id)) {
      seen.add(col.id);
      order.push(col.id);
    }
  }

  // 4. Hidden list, filtered to columns that still exist.
  const hidden = columns
    .filter((c) => !c.required && (storedHidden.has(c.id) || (!seen.has(c.id) && c.defaultHidden)))
    .map((c) => c.id);

  // Last line of defence: never hand back a grid with zero columns.
  if (order.length === 0) return base;

  return {
    order,
    hidden,
    density: isDensity(stored.density) ? stored.density : DEFAULT_DENSITY,
    pageSize: clampPageSize(stored.pageSize),
  };
}

/** Read a screen's config. Never throws — private mode / SSR fall back to defaults. */
export function loadScreenConfig(
  clientId: string,
  screenId: string,
  columns: ColumnSpec[],
): ScreenConfig {
  try {
    const raw = localStorage.getItem(storageKey(clientId, screenId));
    if (!raw) return defaultConfig(columns);
    return reconcileConfig(JSON.parse(raw) as Partial<ScreenConfig>, columns);
  } catch {
    // Corrupt JSON, quota errors, no localStorage — defaults are always valid.
    return defaultConfig(columns);
  }
}

/** Persist a screen's config. Silent on failure; a layout is not worth an error toast. */
export function saveScreenConfig(
  clientId: string,
  screenId: string,
  config: ScreenConfig,
): void {
  try {
    localStorage.setItem(storageKey(clientId, screenId), JSON.stringify(config));
  } catch {
    // Ignore.
  }
}

export function clearScreenConfig(clientId: string, screenId: string): void {
  try {
    localStorage.removeItem(storageKey(clientId, screenId));
  } catch {
    // Ignore.
  }
}

/** Move a column within the visible order. Out-of-range moves are no-ops. */
export function moveColumn(config: ScreenConfig, id: string, delta: number): ScreenConfig {
  const idx = config.order.indexOf(id);
  if (idx < 0) return config;
  const target = idx + delta;
  if (target < 0 || target >= config.order.length) return config;
  const order = [...config.order];
  const [moved] = order.splice(idx, 1);
  order.splice(target, 0, moved);
  return { ...config, order };
}

/**
 * Toggle a column's visibility.
 *
 * A re-shown column is appended at its NATURAL position from the spec list
 * rather than at the end. Hiding "Phone" and showing it again should put it
 * back where it was, not at the far right of the grid.
 */
export function toggleColumn(
  config: ScreenConfig,
  id: string,
  columns: ColumnSpec[],
): ScreenConfig {
  const spec = columns.find((c) => c.id === id);
  if (!spec || spec.required) return config;

  if (config.order.includes(id)) {
    return {
      ...config,
      order: config.order.filter((c) => c !== id),
      hidden: config.hidden.includes(id) ? config.hidden : [...config.hidden, id],
    };
  }

  const naturalOrder = columns.map((c) => c.id);
  const order = [...config.order, id].sort(
    (a, b) => naturalOrder.indexOf(a) - naturalOrder.indexOf(b),
  );
  return { ...config, order, hidden: config.hidden.filter((c) => c !== id) };
}

/**
 * Apply a config to a TanStack column array: filter to visible, then sort into
 * the configured order. Columns are matched on `id ?? accessorKey`, which is
 * how TanStack itself derives a column id.
 */
export function applyConfigToColumns<T extends { id?: string; accessorKey?: unknown }>(
  columns: T[],
  config: ScreenConfig,
): T[] {
  const idOf = (c: T): string => (c.id ?? String(c.accessorKey ?? ""));
  const rank = new Map(config.order.map((id, i) => [id, i]));
  return columns
    .filter((c) => rank.has(idOf(c)))
    .sort((a, b) => (rank.get(idOf(a)) ?? 0) - (rank.get(idOf(b)) ?? 0));
}
