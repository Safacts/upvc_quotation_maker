"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Users,
  Package,
  BarChart3,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  Search,
  Keyboard,
  ExternalLink,
  CalendarRange,
  Calculator,
  SlidersHorizontal,
  UserPlus,
  PackagePlus,
  Factory,
  Scissors,
  PhoneCall,
  FolderKanban,
  Box,
} from "lucide-react";
import {
  useHotkeys,
  CONSOLE_KEYMAP,
  KEYMAP_GROUPS,
  type HotkeyBinding,
} from "@/lib/hooks/useHotkeys";
import { UIProvider, useUI } from "@/lib/hooks/useUI";
import { UISettingsPanel } from "./_components/UISettingsPanel";
import { InlineCalculator, useInlineCalculator } from "./_components/InlineCalculator";
import { PeriodSelector } from "./_components/PeriodSelector";
import { QuickCreate, type QuickCreateKind } from "./_components/QuickCreate";
import {
  defaultPeriod,
  describePeriod,
  type PeriodRange,
} from "@/lib/period";
import "./console.css";

/**
 * ConsoleShell — sidebar + topbar + status bar + global key map + command palette.
 *
 * Composition note: this is a SHELL that renders `children`, not a god component
 * with an `activeTab` string union. `CustomerPortal.tsx` (1284 lines) is the
 * cautionary tale — adding a tab there means editing the union type, `tabTitles`,
 * the nav button AND the pane, and missing one is a compile error at best and a
 * dead tab at worst. Here a new module is a new file under `console/` plus one
 * entry in `NAV`. Nothing else changes.
 */

// ---------------------------------------------------------------------------
// Status bar context
// ---------------------------------------------------------------------------

/**
 * The status bar is Tally's bottom button bar: it teaches the key map by showing
 * the shortcuts valid for the CURRENT screen. That means the screen must be able
 * to push its own metrics and hints up into the shell, hence a context rather
 * than props threaded through every page.
 */
export interface StatusInfo {
  /** e.g. "12 rows" or "3 items". */
  count?: string;
  /** Pre-formatted money string. Formatting stays in console-format.ts. */
  total?: string;
  /** Screen-specific shortcut hints, in priority order. */
  hints?: Array<{ keys: string; label: string }>;
  dirty?: boolean;
  busy?: boolean;
}

interface ConsoleCtx {
  slug: string;
  clientId: string;
  companyName: string;
  setStatus: (s: StatusInfo) => void;
  toast: (message: string, type?: "ok" | "err" | "info") => void;
  /** Registered by the active screen so global keys can reach it. */
  registerAction: (name: ConsoleActionName, fn: (() => void) | null) => void;

  /**
   * The console-wide reporting period (F2).
   *
   * Held in the SHELL, not per screen, so moving from the quotations grid to a
   * report keeps the period the user just set. A per-screen period would mean
   * "This Month" on one screen and "This FY" on the next, and two screens
   * silently describing different businesses.
   */
  period: PeriodRange;
  setPeriod: (p: PeriodRange) => void;
  openPeriodSelector: () => void;

  /**
   * Ask the shell to open the Alt+C master-create dialog. `initialName` seeds
   * the form with whatever the user had already typed into the field.
   */
  openQuickCreate: (
    kind: QuickCreateKind,
    initialName?: string,
    onCreated?: (row: any, existing: boolean) => void,
  ) => void;
}

export type ConsoleActionName =
  | "save"
  | "new"
  | "insertRow"
  | "deleteRow"
  | "export"
  | "back"
  | "search"
  | "duplicate"
  /** Ctrl+, — the screen opens its own column/density dialog. */
  | "config"
  /** Alt+C — the screen decides WHICH master to create from the focused field. */
  | "quickCreate"
  /**
   * PgUp / PgDn.
   *
   * Named "record", not "page", because that is the promise: in the EDITOR they
   * open the previous/next quotation without returning to the list. On a grid
   * there is no open record, so the screen registers them as page navigation
   * instead — the same key, the same intent ("show me the neighbouring data"),
   * resolved per screen.
   */
  | "prevRecord"
  | "nextRecord";

const Ctx = createContext<ConsoleCtx | null>(null);

export function useConsole(): ConsoleCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useConsole must be used inside ConsoleShell");
  return c;
}

/**
 * Push status-bar content from a screen.
 *
 * `JSON.stringify` as the dependency is deliberate. Callers naturally build the
 * object inline — `useConsoleStatus({ count: "12 rows", hints: [...] })` — which
 * is a new reference every render. A reference dependency would setState on
 * every render and loop forever. Comparing by value costs nothing at this size
 * and makes the hook safe to call the obvious way.
 */
export function useConsoleStatus(status: StatusInfo): void {
  const { setStatus } = useConsole();
  const key = JSON.stringify(status);
  useEffect(() => {
    setStatus(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Register a screen-level action so a global hotkey can invoke it. */
export function useConsoleAction(name: ConsoleActionName, fn: (() => void) | null): void {
  const { registerAction } = useConsole();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    // A stable wrapper is registered once and reads the latest closure from the
    // ref — otherwise every state change in the screen re-registers the action.
    registerAction(name, fn ? () => ref.current?.() : null);
    return () => registerAction(name, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, !!fn]);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

const NAV = [
  { key: "", label: "Overview", icon: LayoutDashboard, hint: "1" },
  { key: "quotations", label: "Quotations", icon: FileText, hint: "2" },
  { key: "customers", label: "Customers", icon: Users, hint: "3" },
  { key: "products", label: "Products", icon: Package, hint: "4" },
  { key: "production", label: "Production", icon: Factory, hint: "5" },
  { key: "cutting", label: "Cutting", icon: Scissors, hint: "6" },
  { key: "leads", label: "CRM (Leads)", icon: PhoneCall, hint: "7" },
  { key: "projects", label: "Projects", icon: FolderKanban, hint: "8" },
  { key: "reports", label: "Reports", icon: BarChart3, hint: "9" },
] as const;

/** Minimum width for the console. Below this, the mobile portal is the right surface. */
const MIN_DESKTOP_WIDTH = 1024;

export default function ConsoleShell({
  slug,
  clientId,
  companyName,
  logoUrl,
  children,
}: {
  slug: string;
  clientId: string;
  companyName: string;
  logoUrl?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { applyTo } = useUI();

  const [collapsed, setCollapsed] = useState(false);
  const [status, setStatus] = useState<StatusInfo>({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  /**
   * The Alt+C dialog's request. `null` when closed.
   *
   * `onCreated` is carried in state rather than read from a ref at close time
   * because the caller that OPENED the dialog is the one that knows what to do
   * with the new row — the quotation editor fills its customer fields, the
   * item grid fills a rate. A single shell-level callback could not tell them
   * apart.
   */
  const [quickCreate, setQuickCreate] = useState<{
    kind: QuickCreateKind;
    initialName: string;
    onCreated?: (row: any, existing: boolean) => void;
  } | null>(null);

  /**
   * The reporting period, owned by the shell so it survives navigation between
   * screens. Defaults to the current Indian financial year — see period.ts for
   * why there is no calendar-year option at all.
   */
  const [period, setPeriodState] = useState<PeriodRange>(() => defaultPeriod());

  const actions = useRef<Partial<Record<ConsoleActionName, (() => void) | null>>>({});

  const base = `/${slug}/console`;

  // Apply UI preferences (font size, element size) onto the .vc-root div
  // whenever preferences change. The effect runs after the ref is attached.
  useEffect(() => {
    if (rootRef.current) applyTo(rootRef.current);
  }, [applyTo]);

  const registerAction = useCallback((name: ConsoleActionName, fn: (() => void) | null) => {
    actions.current[name] = fn;
  }, []);

  const toast = useCallback((text: string, type: "ok" | "err" | "info" = "info") => {
    setToastMsg({ text, type });
    window.setTimeout(() => setToastMsg(null), 3200);
  }, []);

  // ---- Inline calculator (Ctrl+/) -----------------------------------------
  // ONE calculator for the whole console, anchored at press time to whichever
  // numeric field has focus. Mounting one per input would put dozens of
  // popovers on a 30-line item grid, all listening for the same key.
  const calc = useInlineCalculator(toast);

  const setPeriod = useCallback((p: PeriodRange) => {
    setPeriodState(p);
  }, []);

  const openPeriodSelector = useCallback(() => setPeriodOpen(true), []);

  const openQuickCreate = useCallback(
    (
      kind: QuickCreateKind,
      initialName = "",
      onCreated?: (row: any, existing: boolean) => void,
    ) => {
      setQuickCreate({ kind, initialName, onCreated });
    },
    [],
  );

  // ---- Viewport gate -------------------------------------------------------
  // A phone reaching /console must land on the portal instead. This runs in an
  // effect (not the server) because the server has no viewport — a UA sniff
  // would misclassify a tablet in landscape and a maximised laptop window alike.
  useEffect(() => {
    function check() {
      if (window.innerWidth < MIN_DESKTOP_WIDTH) {
        router.replace(`/${slug}/home`);
      }
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [router, slug]);

  // Sidebar auto-collapses in the 1024-1279 band so the content keeps its
  // width. A ref tracks whether the user has manually toggled the sidebar;
  // if they have, we respect their choice and do NOT override it on resize.
  // Without this, a user who collapses the sidebar on a wide monitor finds
  // it snapping back to expanded on the next pixel of window resize.
  const manuallyToggled = useRef(false);
  useEffect(() => {
    function onResize() {
      if (!manuallyToggled.current) setCollapsed(window.innerWidth < 1280);
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const logout = useCallback(async () => {
    localStorage.clear();
    await fetch("/api/portal_auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "logout" }),
    }).catch(() => {});
    router.replace("/upvc/login");
  }, [router]);

  // ---- Command palette items ----------------------------------------------
  const paletteItems = useMemo(
    () => [
      ...NAV.map((n) => ({
        label: n.label,
        hint: "Go to",
        run: () => router.push(n.key ? `${base}/${n.key}` : base),
      })),
      {
        label: "3D Design",
        hint: "Open",
        run: () => window.open("/upvc/3d-viewer", "_blank", "noopener,noreferrer"),
      },
      {
        label: "Cutting Optimization",
        hint: "Go to",
        run: () => router.push(`${base}/cutting`),
      },
      {
        label: "Production Board",
        hint: "Go to",
        run: () => router.push(`${base}/production`),
      },
      {
        label: "CRM",
        hint: "Go to",
        run: () => router.push(`${base}/leads`),
      },
      {
        label: "New Quotation",
        hint: "Alt+N",
        run: () => router.push(`${base}/quotations/new`),
      },
      {
        label: "New Customer",
        hint: "Alt+C",
        run: () => openQuickCreate("customer"),
      },
      {
        label: "New Product / Rate",
        hint: "Alt+C",
        run: () => openQuickCreate("product"),
      },
      {
        label: "Change Period",
        hint: "F2",
        run: () => setPeriodOpen(true),
      },
      {
        label: "Configure Screen (columns, density)",
        hint: "Ctrl+,",
        run: () => {
          const fn = actions.current.config;
          if (fn) fn();
          else toast("This screen has nothing to configure", "info");
        },
      },
      {
        label: "Calculator",
        hint: "Ctrl+/",
        run: () => calc.openForActiveField(),
      },
      {
        label: "Keyboard Shortcuts",
        hint: "?",
        run: () => setSheetOpen(true),
      },
      {
        label: "Open Quotation App (mobile)",
        hint: "New tab",
        run: () =>
          window.open(
            `/upvc/${slug}?client=${encodeURIComponent(clientId)}&auto_login=true`,
            "_blank",
            "noopener,noreferrer",
          ),
      },
      { label: "Client Portal (lite view)", hint: "Go to", run: () => router.push(`/${slug}/home`) },
      { label: "Log out", hint: "", run: () => void logout() },
    ],
    [base, router, slug, clientId, logout, openQuickCreate, calc, toast],
  );

  // ---- Global key map ------------------------------------------------------
  // Screen-specific actions are looked up through `actions.current` at PRESS
  // time, not captured at bind time, so a screen that mounts later still gets
  // its Ctrl+S. See the browser-reserved-keys table in useHotkeys.ts for why
  // these particular keys were chosen.
  const bindings: HotkeyBinding[] = useMemo(
    () => [
      {
        key: "k",
        ctrl: true,
        allowInInput: true,
        description: "Go To",
        handler: () => setPaletteOpen((v) => !v),
      },
      {
        key: "g",
        alt: true,
        allowInInput: true,
        description: "Go To (Tally)",
        handler: () => setPaletteOpen((v) => !v),
      },
      {
        // Tally's Ctrl+A. Ctrl+A itself is browser select-all and cannot be taken.
        key: "s",
        ctrl: true,
        allowInInput: true,
        description: "Save",
        handler: () => {
          const fn = actions.current.save;
          if (fn) fn();
          else toast("Nothing to save on this screen", "info");
        },
      },
      {
        key: "enter",
        ctrl: true,
        allowInInput: true,
        description: "Save",
        handler: () => {
          const fn = actions.current.save;
          if (fn) fn();
          else toast("Nothing to save on this screen", "info");
        },
      },
      {
        // Tally's Alt+C. Ctrl+N is a browser new-window at OS level — the page
        // never receives the keydown, so binding it would be a dead promise.
        key: "n",
        alt: true,
        allowInInput: true,
        description: "New quotation",
        handler: () => {
          const fn = actions.current.new;
          if (fn) fn();
          else router.push(`${base}/quotations/new`);
        },
      },
      {
        // Overrides the browser's find-in-page. Justified: find-in-page only
        // searches the ONE page of rows currently rendered, so on a
        // server-paginated grid it silently misses most of the data set. Our
        // search box queries the whole table. Screens with no search box do not
        // register the action and the browser keeps its native behaviour.
        key: "f",
        ctrl: true,
        allowInInput: true,
        description: "Search",
        handler: (event) => {
          const fn = actions.current.search;
          if (fn) {
            fn();
          } else {
            // No search on this screen — hand Ctrl+F back to the browser rather
            // than swallowing it and appearing broken. useHotkeys has already
            // called preventDefault, so re-issue the native find via a fresh
            // event is impossible; instead we simply inform the user.
            void event;
            toast("No search on this screen", "info");
          }
        },
      },
      {
        key: "i",
        alt: true,
        allowInInput: true,
        description: "Insert row",
        handler: () => actions.current.insertRow?.(),
      },
      {
        key: "x",
        alt: true,
        allowInInput: true,
        description: "Delete row",
        handler: () => actions.current.deleteRow?.(),
      },
      {
        key: "e",
        ctrl: true,
        allowInInput: true,
        // The action is per-screen: grids register "export" as CSV, the
        // editor registers it as PDF download. The shortcut sheet lists
        // "Export" (not "CSV") so the label matches both.
        description: "Export",
        handler: () => {
          const fn = actions.current.export;
          if (fn) fn();
          else toast("Nothing to export on this screen", "info");
        },
      },
      {
        // Tally's Alt+2. Bound as Alt+D (the mnemonic) AND registered in
        // CONSOLE_KEYMAP so the ? cheatsheet and the actual binding agree.
        // Screens that can duplicate (the editor) register the action; on
        // screens that cannot, nothing happens — no toast, no false promise.
        key: "d",
        alt: true,
        allowInInput: true,
        description: "Duplicate",
        handler: () => actions.current.duplicate?.(),
      },
      {
        // Tally's Alt+C — create master on the fly, kept on its ORIGINAL key
        // because it is the one Tally users reach for without thinking.
        //
        // The screen gets first refusal: the quotation editor registers
        // "quickCreate" so it can decide between a customer and a product from
        // which field has focus, and so it can write the new row straight back
        // into the form. Screens that do not register it fall back to the
        // customer dialog, which is the overwhelmingly common case.
        key: "c",
        alt: true,
        allowInInput: true,
        description: "Create master on the fly",
        handler: () => {
          const fn = actions.current.quickCreate;
          if (fn) fn();
          // No screen context (Overview, Reports) — let the user pick rather
          // than guessing and making them back out of the wrong form.
          else openQuickCreate("ask");
        },
      },
      {
        // Tally's F2, on its real key — the browser does not reserve it.
        //
        // `allowInInput` is TRUE deliberately: an operator halfway through
        // typing a customer name still expects F2 to change the period, and
        // making them click out of the field first breaks exactly the muscle
        // memory this layer exists to preserve. It is a function key, so it can
        // never be mistaken for text the user meant to type.
        key: "f2",
        allowInInput: true,
        description: "Change period",
        handler: () => setPeriodOpen((v) => !v),
      },
      {
        // Tally's F12 (Configure). F12 is DevTools in Chrome and is never
        // delivered to the page, so this is the documented substitution — the
        // ? sheet says so in as many words rather than leaving a dead key.
        key: ",",
        ctrl: true,
        allowInInput: true,
        description: "Configure screen",
        handler: () => {
          const fn = actions.current.config;
          if (fn) fn();
          else toast("This screen has nothing to configure", "info");
        },
      },
      {
        // Inline calculator, anchored to the focused amount field.
        //
        // Ctrl+/ and not Ctrl+? : the latter needs Shift and collides with
        // browser help. `allowInInput` MUST be true — the entire point is to
        // fire while the caret is sitting in a rate box.
        key: "/",
        ctrl: true,
        allowInInput: true,
        description: "Calculator",
        handler: () => calc.openForActiveField(),
      },
      {
        // PgUp / PgDn — Tally's next/previous voucher.
        //
        // `allowInInput` is FALSE. In the editor these keys sit inside a
        // spreadsheet grid full of inputs, and stealing PgDn from a focused
        // textarea would stop the user scrolling a long description. Outside a
        // field they mean "show me the neighbouring record", which is what the
        // editor and the grids register.
        key: "pageup",
        allowInInput: false,
        description: "Previous record",
        handler: () => actions.current.prevRecord?.(),
      },
      {
        key: "pagedown",
        allowInInput: false,
        description: "Next record",
        handler: () => actions.current.nextRecord?.(),
      },
      {
        key: "escape",
        allowInInput: true,
        description: "Back / close",
        handler: () => {
          // Innermost layer first: a modal's Escape must not also trigger the
          // editor's discard prompt behind it.
          //
          // The calculator, the period dialog and the quick-create dialog all
          // stop keydown propagation themselves, so in practice they never
          // reach this handler — these checks are the belt to that braces, for
          // the case where focus has escaped the dialog (e.g. the user clicked
          // the scrim). Order matches visual stacking.
          if (calc.open) return calc.close();
          if (quickCreate) return setQuickCreate(null);
          if (periodOpen) return setPeriodOpen(false);
          if (sheetOpen) return setSheetOpen(false);
          if (paletteOpen) return setPaletteOpen(false);
          const fn = actions.current.back;
          if (fn) fn();
        },
      },
      {
        key: "?",
        allowInInput: false,
        description: "Shortcuts",
        handler: () => setSheetOpen((v) => !v),
      },
      {
        key: "/",
        shift: true,
        allowInInput: false,
        description: "Shortcuts",
        handler: () => setSheetOpen((v) => !v),
      },
    ],
    [
      base,
      router,
      toast,
      sheetOpen,
      paletteOpen,
      periodOpen,
      quickCreate,
      calc,
      openQuickCreate,
    ],
  );

  useHotkeys(bindings);

  const activeKey = useMemo(() => {
    const rest = (pathname || "").replace(base, "").replace(/^\//, "");
    return rest.split("/")[0] || "";
  }, [pathname, base]);

  const crumb = useMemo(() => {
    const nav = NAV.find((n) => n.key === activeKey);
    return nav ? nav.label : "Overview";
  }, [activeKey]);

  return (
    <Ctx.Provider
      value={{
        slug,
        clientId,
        companyName,
        setStatus,
        toast,
        registerAction,
        period,
        setPeriod,
        openPeriodSelector,
        openQuickCreate,
      }}
    >
      <div
        ref={rootRef}
        className={"vc-root" + (collapsed ? " vc-collapsed" : "")}
      >
        {/* ---- Sidebar ---- */}
        <aside className="vc-sidebar">
          <div className="vc-brand">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" />
            ) : (
              <div className="vc-brand-fallback">
                {(companyName || "V").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="vc-brand-text">
              <div className="vc-brand-name">{companyName || clientId}</div>
              <div className="vc-brand-sub">Ops Console</div>
            </div>
          </div>

          <nav className="vc-nav">
            <div className="vc-nav-section">Workspace</div>
            {NAV.map((n) => {
              const Icon = n.icon;
              const href = n.key ? `${base}/${n.key}` : base;
              return (
                <button
                  key={n.key || "overview"}
                  type="button"
                  className={"vc-nav-item" + (activeKey === n.key ? " vc-active" : "")}
                  onClick={() => router.push(href)}
                  title={n.label}
                >
                  <Icon size={15} strokeWidth={2} />
                  <span className="vc-nav-label">{n.label}</span>
                </button>
              );
            })}

            <div className="vc-nav-section">Elsewhere</div>
            <a
              className="vc-nav-item"
              href={`/upvc/${slug}?client=${encodeURIComponent(clientId)}&auto_login=true`}
              target="_blank"
              rel="noopener noreferrer"
              title="Mobile quotation app"
            >
              <ExternalLink size={15} strokeWidth={2} />
              <span className="vc-nav-label">Mobile App</span>
            </a>
            <button
              type="button"
              className="vc-nav-item"
              onClick={() => router.push(`/${slug}/home`)}
              title="Client portal (lite)"
            >
              <PanelLeft size={15} strokeWidth={2} />
              <span className="vc-nav-label">Lite Portal</span>
            </button>
          </nav>

          <div className="vc-sidebar-foot">
            <button
              type="button"
              className="vc-nav-item"
              onClick={() => {
                manuallyToggled.current = true;
                setCollapsed((v) => !v);
              }}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeft size={15} /> : <PanelLeftClose size={15} />}
              <span className="vc-nav-label">{collapsed ? "Expand" : "Collapse"}</span>
            </button>
            <button type="button" className="vc-nav-item" onClick={() => void logout()}>
              <LogOut size={15} strokeWidth={2} />
              <span className="vc-nav-label">Log out</span>
            </button>
          </div>
        </aside>

        {/* ---- Topbar ---- */}
        <header className="vc-topbar">
          <div className="vc-crumb">
            <span>{companyName || clientId} / </span>
            {crumb}
          </div>
          <div className="vc-topbar-spacer" />

          {/* The active period is ALWAYS on screen. A report is meaningless
              without knowing the window it covers, and a user who forgets they
              set "Last Month" three screens ago will misread every total. */}
          <button
            type="button"
            className="vc-goto vc-period-chip"
            onClick={() => setPeriodOpen(true)}
            title="Change period (F2)"
          >
            <CalendarRange size={13} />
            {describePeriod(period)}
            <span className="vc-kbd">F2</span>
          </button>

          <button type="button" className="vc-goto" onClick={() => setPaletteOpen(true)}>
            <Search size={13} />
            Go To...
            <span className="vc-kbd">Ctrl K</span>
          </button>
          <button
            type="button"
            className="vc-goto"
            onClick={() => setSheetOpen(true)}
            title="Keyboard shortcuts"
          >
            <Keyboard size={13} />
            <span className="vc-kbd">?</span>
          </button>
        </header>

        {/* ---- Main ---- */}
        <main className="vc-main">{children}</main>

        {/* ---- Status bar ---- */}
        <footer className="vc-statusbar">
          {status.busy && <span className="vc-spinner" />}
          {status.count && <span className="vc-status-metric">{status.count}</span>}
          {status.total && (
            <span className="vc-status-metric">
              <b>{status.total}</b>
            </span>
          )}
          {status.dirty && <span className="vc-dirty">Unsaved changes</span>}
          <span className="vc-status-spacer" />
          {(status.hints || []).map((h) => (
            <span className="vc-status-hint" key={h.keys + h.label}>
              <span className="vc-kbd">{h.keys}</span>
              {h.label}
            </span>
          ))}
        </footer>

        {/* ---- Overlays ---- */}
        {paletteOpen && (
          <CommandPalette items={paletteItems} onClose={() => setPaletteOpen(false)} />
        )}
        {sheetOpen && <ShortcutSheet onClose={() => setSheetOpen(false)} />}

        {periodOpen && (
          <PeriodSelector
            value={period}
            onApply={setPeriod}
            onClose={() => setPeriodOpen(false)}
          />
        )}

        {quickCreate && (
          <QuickCreate
            kind={quickCreate.kind}
            initialName={quickCreate.initialName}
            onCreated={(row, existing) => {
              quickCreate.onCreated?.(row, existing);
              toast(
                existing
                  ? `${(row as any).name} was already on file - linked`
                  : `${(row as any).name} created`,
                "ok",
              );
            }}
            onClose={() => setQuickCreate(null)}
          />
        )}

        {/* The calculator is rendered LAST of the dialogs and positioned
            absolutely against its anchor field, so it can float over an open
            editor without an overlay scrim stealing the grid's focus. */}
        <InlineCalculator
          open={calc.open}
          anchor={calc.anchor}
          onClose={calc.close}
          onToast={toast}
        />

        {toastMsg && (
          <div
            className={
              "vc-toast" +
              (toastMsg.type === "ok" ? " vc-toast-ok" : toastMsg.type === "err" ? " vc-toast-err" : "")
            }
          >
            {toastMsg.text}
          </div>
        )}

        {/* Global display preferences (font/element size). Distinct from Ctrl+,
            which configures the CURRENT SCREEN's columns — see screen-config.ts
            for why those two axes are deliberately separate stores. */}
        <UISettingsPanel />
      </div>
    </Ctx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Command palette (Ctrl+K / Alt+G) — Tally's Alt+G "Go To"
// ---------------------------------------------------------------------------

function CommandPalette({
  items,
  onClose,
}: {
  items: Array<{ label: string; hint: string; run: () => void }>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    // Substring, not fuzzy. "sales" should not match "Settings" via scattered
    // letters — a palette that returns confident nonsense is worse than one that
    // returns nothing.
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [items, query]);

  // Clamp the selection whenever the result set shrinks, or Enter would fire on
  // an index that no longer exists.
  useEffect(() => {
    setSel((s) => Math.min(s, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => (s + 1) % Math.max(1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => (s - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[sel];
      if (item) {
        onClose();
        item.run();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Handled here as well as in the shell: this input has focus and stops
      // the event, so the global Escape binding would not otherwise fire.
      onClose();
    }
  }

  return (
    <div className="vc-overlay" onMouseDown={onClose}>
      <div className="vc-palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="vc-palette-input"
          placeholder="Go to... (type a screen or action)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="vc-palette-list">
          {filtered.length === 0 && <div className="vc-palette-empty">No matches</div>}
          {filtered.map((item, i) => (
            <div
              key={item.label}
              className={"vc-palette-item" + (i === sel ? " vc-sel" : "")}
              onMouseEnter={() => setSel(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                onClose();
                item.run();
              }}
            >
              {item.label}
              {item.hint && <span className="vc-palette-hint">{item.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shortcut cheatsheet (?)
// ---------------------------------------------------------------------------

function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="vc-overlay" onMouseDown={onClose}>
      <div
        className="vc-sheet"
        onMouseDown={(e) => e.stopPropagation()}
        // Owns the keyboard while open, so "?" does not re-toggle it and Escape
        // is handled once. Focused on mount so the user can scroll with arrows.
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" || e.key === "?") {
            e.preventDefault();
            onClose();
          }
        }}
        tabIndex={-1}
        ref={(el) => el?.focus()}
      >
        <h3>Keyboard Shortcuts</h3>
        <div style={{ fontSize: 12, color: "#5b6673" }}>
          Tally equivalents shown where the meaning is the same. Grouped by task —
          every key listed here is implemented.
        </div>

        {/* Grouped, not one flat list of twenty. A wall of shortcuts is a wall
            nobody reads; grouped by task a user scans to "Entry" and finds the
            three keys they came for. Sections are driven by KEYMAP_GROUPS so
            the sheet and the bindings cannot drift. */}
        {KEYMAP_GROUPS.map((group) => {
          const rows = CONSOLE_KEYMAP.filter((k) => k.group === group);
          if (!rows.length) return null;
          return (
            <div key={group} className="vc-sheet-section">
              <div className="vc-sheet-group">{group}</div>
              <div className="vc-sheet-grid">
                {rows.map((k) => (
                  <div className="vc-sheet-row" key={k.keys + k.action}>
                    <span className="vc-kbd">{k.keys}</span>
                    <span>
                      {k.action}
                      {k.tally && (
                        <span style={{ color: "#8a94a1", fontSize: 11 }}> · Tally {k.tally}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {/* Stating the browser limitation openly is deliberate. A user who
            presses Ctrl+A expecting Tally's save and gets select-all will
            conclude the app is broken; told once, they adapt in a day. */}
        <div className="vc-sheet-note">
          <b>Why not Ctrl+A and F12?</b> The browser reserves them — Ctrl+A is
          select-all, Ctrl+N opens a new window, and F12 opens developer tools.
          They never reach the page, so Tally&apos;s <b>Ctrl+A (Accept)</b> is{" "}
          <b>Ctrl+S</b> here, <b>Ctrl+Q (Quit)</b> is <b>Esc</b>, and{" "}
          <b>F12 (Configure)</b> is <b>Ctrl+,</b>. Everything else keeps its Tally key.
        </div>
      </div>
    </div>
  );
}

