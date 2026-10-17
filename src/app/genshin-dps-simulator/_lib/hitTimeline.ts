import { HitLogEntry } from './types';

export const PLOT_WIDTH = 1000;
export const PLOT_HEIGHT = 100;

export type HitSeries = {
  key: string;
  label: string;
  color: string;
  categories: string[];
};

// Validated against the sheet surface (#14141a) with every pair compared,
// because the categories interleave along the timeline. Only three hues clear
// the colorblind floors that way, so any further category folds into "Other".
const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70'];
const OTHER_SERIES_COLOR = '#71717a';
const CATEGORY_PRIORITY = ['Normal', 'Skill', 'Charged', 'Bite', 'Burst'];

const getCategoryPriority = (category: string): number => {
  const priority = CATEGORY_PRIORITY.indexOf(category);
  if (priority < 0) {
    return CATEGORY_PRIORITY.length;
  }
  return priority;
};

const sortByPriority = (categories: string[]): string[] =>
  [...categories].sort(
    (first, second) => getCategoryPriority(first) - getCategoryPriority(second)
  );

const buildOtherSeries = (categories: string[]): HitSeries[] => {
  if (categories.length === 0) {
    return [];
  }
  return [
    {
      key: 'other',
      label: `Other (${categories.join(', ')})`,
      color: OTHER_SERIES_COLOR,
      categories,
    },
  ];
};

export const getHitSeries = (categories: string[]): HitSeries[] => {
  const sorted = sortByPriority(categories);
  const ownSeries = sorted
    .slice(0, SERIES_COLORS.length)
    .map((category, slot) => ({
      key: category,
      label: category,
      color: SERIES_COLORS[slot],
      categories: [category],
    }));
  return [
    ...ownSeries,
    ...buildOtherSeries(sorted.slice(SERIES_COLORS.length)),
  ];
};

export const getColorByCategory = (
  series: HitSeries[]
): Record<string, string> =>
  Object.fromEntries(
    series.flatMap((entry) =>
      entry.categories.map((category) => [category, entry.color])
    )
  );

const NICE_STEP_FACTORS = [1, 2, 2.5, 5];
const MIN_TICK_INTERVALS = 3;
const MAX_TICK_INTERVALS = 5;

const getNiceStepCandidates = (maxDamage: number): number[] => {
  const magnitude = 10 ** Math.floor(Math.log10(maxDamage));
  return [magnitude / 10, magnitude].flatMap((base) =>
    NICE_STEP_FACTORS.map((factor) => factor * base)
  );
};

const getIntervalCount = (maxDamage: number, step: number): number =>
  Math.ceil(maxDamage / step);

const hasReadableTickCount = (maxDamage: number, step: number): boolean => {
  const intervals = getIntervalCount(maxDamage, step);
  return intervals >= MIN_TICK_INTERVALS && intervals <= MAX_TICK_INTERVALS;
};

const getTightestStep = (maxDamage: number): number =>
  getNiceStepCandidates(maxDamage)
    .filter((step) => hasReadableTickCount(maxDamage, step))
    .reduce((best, step) => {
      const top = getIntervalCount(maxDamage, step) * step;
      const bestTop = getIntervalCount(maxDamage, best) * best;
      if (top < bestTop) {
        return step;
      }
      return best;
    }, 10 ** Math.ceil(Math.log10(maxDamage)));

export const getDamageTicks = (maxDamage: number): number[] => {
  if (maxDamage <= 0) {
    return [0];
  }
  const step = getTightestStep(maxDamage);
  const intervals = getIntervalCount(maxDamage, step);
  return Array.from({ length: intervals + 1 }, (_, i) => i * step);
};

const TIME_TICK_SECONDS = 10;

export const getTimeDomainEnd = (hits: HitLogEntry[]): number => {
  const lastTime = hits.reduce((latest, hit) => Math.max(latest, hit.time), 0);
  return Math.max(
    TIME_TICK_SECONDS,
    Math.ceil(lastTime / TIME_TICK_SECONDS) * TIME_TICK_SECONDS
  );
};

export const getTimeTicks = (domainEnd: number): number[] =>
  Array.from(
    { length: Math.floor(domainEnd / TIME_TICK_SECONDS) + 1 },
    (_, i) => i * TIME_TICK_SECONDS
  );

export const getHighestDamage = (hits: HitLogEntry[]): number =>
  hits.reduce((highest, hit) => Math.max(highest, hit.damage), 0);

export const findNearestHit = (
  hits: HitLogEntry[],
  time: number
): HitLogEntry | null =>
  hits.reduce<HitLogEntry | null>((nearest, hit) => {
    if (!nearest) {
      return hit;
    }
    if (Math.abs(hit.time - time) < Math.abs(nearest.time - time)) {
      return hit;
    }
    return nearest;
  }, null);

const COMPACT_FORMAT = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const formatCompactNumber = (value: number): string =>
  COMPACT_FORMAT.format(value);
