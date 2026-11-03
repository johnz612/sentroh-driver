import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { cached, cachedAge, remember, trackLoad } from "@/lib/cache";

/**
 * Loads data for a screen. With `key`, the last copy shows at once while
 * fresh data loads. Reloads when deps change, every `intervalMs` while the
 * screen is focused, and on coming back when older than `refreshOnFocusMs`.
 * Returns { data, error, loading, refreshing, reload, refresh, setData }.
 */
export function useLoader(load, deps, { intervalMs, key, refreshOnFocusMs = 10000 } = {}) {
  const [state, setState] = useState(() => ({ data: key ? cached(key) ?? null : null, error: null, loading: true, refreshing: false }));
  const loadRef = useRef(load);
  loadRef.current = load;
  const lastLoad = useRef(0);

  const run = useCallback(async (byUser) => {
    setState((st) => ({ ...st, loading: true, refreshing: !!byUser, error: null }));
    try {
      const data = await trackLoad(key, loadRef.current());
      if (key) remember(key, data);
      lastLoad.current = Date.now();
      setState({ data, error: null, loading: false, refreshing: false });
    } catch (error) {
      setState((st) => ({ ...st, error, loading: false, refreshing: false }));
    }
  }, [key]);

  const reload = useCallback(() => run(false), [run]);
  const refresh = useCallback(() => run(true), [run]);
  const setData = useCallback((data) => {
    if (key) remember(key, data);
    setState((st) => ({ ...st, data }));
  }, [key]);

  useEffect(() => { reload(); }, [reload, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      const stale = key && cachedAge(key) === Infinity;
      if (lastLoad.current && (stale || Date.now() - lastLoad.current > refreshOnFocusMs)) reload();
      if (!intervalMs) return undefined;
      const timer = setInterval(reload, intervalMs);
      return () => clearInterval(timer);
    }, [reload, intervalMs, refreshOnFocusMs, key]),
  );

  return { ...state, reload, refresh, setData };
}
