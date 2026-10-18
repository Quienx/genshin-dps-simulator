import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

// The timeline's panel layout (which panels are minimized, how big each
// one is), kept in this browser only (localStorage): it comes back on
// reload. Storage can be missing or blocked (a private window): then the
// layout just starts from its defaults.
export const layoutStorage = {
  getItem: (key: string): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Not kept: the next load starts from the defaults.
    }
  },
};

export type MinimizedPanels = {
  chart: boolean;
  log: boolean;
  event: boolean;
  enemy: boolean;
};

const PANELS_KEY = 'genshin-sim:minimized-panels';
const NONE_MINIMIZED: MinimizedPanels = {
  chart: false,
  log: false,
  event: false,
  enemy: false,
};

// What a stored value says, keeping only the known panels' flags.
export const parseMinimizedPanels = (text: string | null): MinimizedPanels => {
  try {
    const stored = JSON.parse(text ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(NONE_MINIMIZED).map(([panel, fallback]) => [
        panel,
        typeof stored[panel] === 'boolean' ? stored[panel] : fallback,
      ])
    ) as MinimizedPanels;
  } catch {
    return NONE_MINIMIZED;
  }
};

// Minimized panels, remembered across reloads. Read after mounting, so the
// server's render (nothing minimized) matches the first client one.
export const useMinimizedPanels = () => {
  const [panels, setPanels] = useState(NONE_MINIMIZED);
  useEffect(() => {
    setPanels(parseMinimizedPanels(layoutStorage.getItem(PANELS_KEY)));
  }, []);
  const togglePanel = useCallback(
    (panel: keyof MinimizedPanels) =>
      setPanels((current) => {
        const next = { ...current, [panel]: !current[panel] };
        layoutStorage.setItem(PANELS_KEY, JSON.stringify(next));
        return next;
      }),
    []
  );
  return { panels, togglePanel };
};

// Whether a media query holds: false on the server and the first client
// render, then the real answer (kept up to date).
export const useMediaQuery = (query: string) =>
  useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        const list = window.matchMedia(query);
        list.addEventListener('change', onChange);
        return () => list.removeEventListener('change', onChange);
      },
      [query]
    ),
    () => window.matchMedia(query).matches,
    () => false
  );

// Tailwind's `lg`: wide enough for the panels side by side, resizable.
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
