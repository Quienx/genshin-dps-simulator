import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { CritMode } from '../../_lib/types';

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

// The timeline's names column (px): dragged wider or narrower by its
// edge, remembered across reloads.
const LABEL_WIDTH_KEY = 'genshin-sim:label-width';
export const LABEL_WIDTH = { min: 160, max: 360, initial: 220 } as const;
export const clampLabelWidth = (width: number) =>
  Math.round(Math.min(LABEL_WIDTH.max, Math.max(LABEL_WIDTH.min, width)));
export const parseLabelWidth = (text: string | null): number => {
  const width = Number(text);
  return text && Number.isFinite(width)
    ? clampLabelWidth(width)
    : LABEL_WIDTH.initial;
};

// The width, read after mounting (as the panels are); `resize` follows a
// drag, `save` keeps where it ended.
export const useLabelWidth = () => {
  const [width, setWidth] = useState<number>(LABEL_WIDTH.initial);
  const latest = useRef<number>(LABEL_WIDTH.initial);
  useEffect(() => {
    latest.current = parseLabelWidth(layoutStorage.getItem(LABEL_WIDTH_KEY));
    setWidth(latest.current);
  }, []);
  const resize = useCallback((next: number) => {
    latest.current = clampLabelWidth(next);
    setWidth(latest.current);
  }, []);
  const save = useCallback(
    () => layoutStorage.setItem(LABEL_WIDTH_KEY, String(latest.current)),
    []
  );
  return { width, resize, save };
};

// How CRITs are played: each hit's average (the default: the same total
// on every run, to compare rotations) or rolled, as the user last picked.
const CRIT_MODE_KEY = 'genshin-sim:crit-mode';
export const parseCritMode = (text: string | null): CritMode =>
  text === 'random' ? 'random' : 'expected';
export const loadCritMode = (): CritMode =>
  parseCritMode(layoutStorage.getItem(CRIT_MODE_KEY));
export const storeCritMode = (mode: CritMode) =>
  layoutStorage.setItem(CRIT_MODE_KEY, mode);

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
