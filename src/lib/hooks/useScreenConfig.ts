"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyConfigToColumns,
  defaultConfig,
  loadScreenConfig,
  saveScreenConfig,
  type ColumnSpec,
  type ScreenConfig,
} from "@/lib/screen-config";

/**
 * useScreenConfig — binds one grid to its persisted Ctrl+, layout.
 *
 * HYDRATION: the initial state is `defaultConfig`, and localStorage is read in
 * an effect AFTER mount. Reading storage in the `useState` initialiser would
 * make the server-rendered HTML (defaults) disagree with the first client
 * render (stored layout) and React would throw a hydration mismatch. Same
 * reasoning as `useUI`, and the same trade: one extra paint of the default
 * column set in exchange for a page that renders at all.
 *
 * `ready` is exposed so a caller can avoid firing its first fetch with the
 * DEFAULT page size and then immediately re-firing with the stored one. On a
 * grid configured for 200 rows that would be two full round trips per visit.
 */
export function useScreenConfig(
  clientId: string,
  screenId: string,
  columns: ColumnSpec[],
) {
  const [config, setConfig] = useState<ScreenConfig>(() => defaultConfig(columns));
  const [ready, setReady] = useState(false);

  // `columns` is almost always an inline array literal, so a reference
  // dependency would re-read storage on every render. The id list is what
  // actually matters for reconciliation.
  const columnsKey = columns.map((c) => c.id).join("|");

  useEffect(() => {
    setConfig(loadScreenConfig(clientId, screenId, columns));
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, screenId, columnsKey]);

  const update = useCallback(
    (next: ScreenConfig) => {
      setConfig(next);
      saveScreenConfig(clientId, screenId, next);
    },
    [clientId, screenId],
  );

  const reset = useCallback(() => {
    const next = defaultConfig(columns);
    setConfig(next);
    saveScreenConfig(clientId, screenId, next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, screenId, columnsKey]);

  /** Filter + order a TanStack column array according to the current config. */
  const applyTo = useCallback(
    <T extends { id?: string; accessorKey?: unknown }>(cols: T[]): T[] =>
      applyConfigToColumns(cols, config),
    [config],
  );

  return useMemo(
    () => ({ config, setConfig: update, reset, applyTo, ready }),
    [config, update, reset, applyTo, ready],
  );
}
